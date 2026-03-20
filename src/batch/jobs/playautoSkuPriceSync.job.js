const config = require("../../config");
const { executeBatch } = require("../framework/batchExecutor");
const { createPlayautoClient } = require("../../services/playautoHttpClient");
const { getPlayautoAuth } = require("../../services/playautoTokenService");

/**
 * PlayAuto SKU 단가(cost_price) 동기화
 * - 기준: gds_mst.prod_cd == sku_mst.sku_cd
 * - 값: gds_mst.rcv_uprc -> PlayAuto cost_price
 *
 * 흐름:
 * 1) sku_mst에 sku_cd 있으면 PUT /api/stock/edit/v1.2
 * 2) 없으면 POST /api/stock/add/v1.2
 */
exports.run = async (runType = "SKU_PRICE_SYNC") => {
  return executeBatch({
    jobName: "PLAYAUTO_SKU_PRICE_SYNC",
    runType,

    /**
     * client : 트랜잭션 DB 커넥션 (executeBatch가 begin/commit/rollback 관리)
     * stat   : { totalCnt, successCnt, failCnt } 형태로 사용
     */
    jobFn: async (client, stat) => {
      const LOCK_KEY = 888201;
      const ACTOR = "BATCH";
      const TEST_TARGET_PROD_CDS = [
        "8809615362129",
        "880961534161",
        "8809615364178",
      ];

      // stat 확장 사용(프레임워크가 기본 3개만 줘도 JS 객체라 추가 가능)
      stat.skipCnt = 0;

      const toNum = (v, d = null) => {
        if (v === null || v === undefined || v === "") return d;
        const n = Number(v);
        return Number.isNaN(n) ? d : n;
      };

      async function callPlayautoEdit(http, payload) {
        const res = await http.put(config.playauto.skuEditUrl, payload);
        return res.data;
      }

      async function callPlayautoAdd(http, payload) {
        const res = await http.post(config.playauto.skuAddUrl, payload);
        return res.data;
      }

      async function selectDefaultDepotNo(solNo) {
        const r = await client.query(
          `
          SELECT dpt_no
            FROM dpt_mst
           WHERE sol_no = $1
             AND del_yn = 'N'
             AND use_yn = 'Y'
           ORDER BY dflt_yn DESC, reg_dt ASC
           LIMIT 1
          `,
          [solNo],
        );
        return r.rows?.[0]?.dptNo || null;
      }

      async function insertSkuHisSnapshotBySkuId(skuId, reason) {
        const r = await client.query(
          `
          SELECT
              sku_id,
              sol_no,
              prod_no,
              sku_cd,
              prod_nm,
              sale_prc_amt,
              cost_prc_amt,
              supl_prc_amt,
              brd_nm,
              mfr_nm,
              mdl_nm,
              last_sync_qty,
              safe_stk_qty
            FROM sku_mst
           WHERE sku_id = $1
             AND del_yn = 'N'
           LIMIT 1
          `,
          [skuId],
        );

        const row = r.rows?.[0];
        if (!row) return;

        await client.query(
          `
          INSERT INTO sku_his (
              sku_his_id,
              sku_id,
              sol_no,
              prod_no,
              sku_cd,
              prod_nm,
              sale_prc_amt,
              cost_prc_amt,
              supl_prc_amt,
              brd_nm,
              mfr_nm,
              mdl_nm,
              last_sync_qty,
              safe_stk_qty,
              chg_rsn_cn,
              rgtr_id,
              del_yn,
              use_yn
          )
          VALUES (
              (SELECT fn_create_pk('SKU_HIS')),
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
              $16,'N','Y'
          )
          `,
          [
            row.skuId,
            row.solNo,
            row.prodNo,
            row.skuCd,
            row.prodNm,
            row.salePrcAmt,
            row.costPrcAmt,
            row.suplPrcAmt,
            row.brdNm,
            row.mfrNm,
            row.mdlNm,
            row.lastSyncQty,
            row.safeStkQty,
            reason,
            ACTOR,
          ],
        );
      }

      function buildEditPayload({ skuCd, costPrice }) {
        return {
          sku_cd: skuCd,
          cost_price: costPrice,
        };
      }

      function buildAddPayload({ skuCd, prodNm, costPrice, depotNo }) {
        return {
          prod_name: prodNm,
          tax_type: "과세",
          cost_price: costPrice,
          opt: [
            {
              sku_cd: skuCd,
              product_price: 0,
              supply_price: 0,
              cost_price: costPrice,
              depots: [
                {
                  depot_no: depotNo,
                  real_stock: 0,
                  safe_stock: 0,
                },
              ],
              opt1_type: "없음",
              opt1: "없음",
            },
          ],
        };
      }

      // =====================================================
      // 🔐 동시 실행 방지(advisory lock)
      // =====================================================
      const lockRes = await client.query(
        "SELECT pg_try_advisory_lock($1) AS locked",
        [LOCK_KEY],
      );

      if (!lockRes.rows?.[0]?.locked) {
        console.log("[JOB][PLAYAUTO][SKU_PRICE] 이미 실행중 (SKIP)");
        return;
      }

      try {
        console.log("[JOB][PLAYAUTO][SKU_PRICE] 시작");

        // =====================================================
        // ✅ 토큰/솔루션 확보 (없으면 자동 발급/갱신)
        // =====================================================
        const { token, solNo } = await getPlayautoAuth(client);
        if (!token || !solNo) throw new Error("PlayAuto 인증정보 확보 실패");

        const http = createPlayautoClient(token);

        // 대표 배송처(등록시 필요)
        const depotNo = await selectDefaultDepotNo(solNo);

        // =====================================================
        // ✅ 이카운트 품목 조회
        // =====================================================
        const gdsRes = await client.query(
          `
          SELECT
              gds_id,
              prod_cd,
              rcv_uprc
            FROM gds_mst
           WHERE del_yn = 'N'
             AND use_yn = 'Y'
             AND prod_cd IS NOT NULL
             AND prod_cd = ANY($1)
           ORDER BY prod_cd
          `,
          [TEST_TARGET_PROD_CDS],
        );

        console.log(
          `[JOB][PLAYAUTO][SKU_PRICE] 테스트 대상 prod_cd=${TEST_TARGET_PROD_CDS.join(", ")}`,
        );

        // =====================================================
        // ✅ Loop
        // =====================================================
        for (const g of gdsRes.rows) {
          stat.totalCnt++;

          try {
            const skuCd = String(g.prodCd || "").trim();
            const costPrice = toNum(g.rcvUprc, null);

            if (!skuCd) throw new Error("prod_cd(=sku_cd) 누락");
            if (costPrice === null) {
              stat.skipCnt++;
              continue;
            }

            // sku_mst 존재 확인(PlayAuto LIST 동기화 테이블)
            const skuRes = await client.query(
              `
              SELECT
                  sku_id,
                  sku_cd,
                  prod_nm,
                  cost_prc_amt
                FROM sku_mst
               WHERE sku_cd = $1
                 AND del_yn = 'N'
               LIMIT 1
              `,
              [skuCd],
            );

            const sku = skuRes.rows?.[0] || null;

            // 동일 단가면 스킵(불필요 API 호출 방지)
            if (sku && Number(sku.costPrcAmt ?? 0) === Number(costPrice)) {
              stat.skipCnt++;
              continue;
            }

            if (sku) {
              // -------------------------
              // 존재하면 수정(edit)
              // -------------------------
              await insertSkuHisSnapshotBySkuId(
                sku.skuId,
                "ECOUNT_PRICE_SYNC_BEFORE_EDIT",
              );

              const payload = buildEditPayload({ skuCd, costPrice });
              const result = await callPlayautoEdit(http, payload);

              if (result?.result === "실패") {
                // e3020: 수정할 정보 없음 → 스킵 처리
                if (result?.error_code === "e3020") {
                  stat.skipCnt++;
                  continue;
                }
                const msg = (result?.messages || [result?.message || ""]).join(
                  " ",
                );
                throw new Error(
                  `[PLAYAUTO EDIT FAIL] ${result?.error_code || ""} ${msg}`.trim(),
                );
              }

              // DB 반영
              await client.query(
                `
                UPDATE sku_mst
                   SET cost_prc_amt = $2,
                       mdfcn_dt = CURRENT_TIMESTAMP,
                       mdfr_id = $3
                 WHERE sku_id = $1
                `,
                [sku.skuId, costPrice, ACTOR],
              );

              stat.successCnt++;
            } else {
              // -------------------------
              // 없으면 등록(add)
              // -------------------------
              if (!depotNo) {
                throw new Error(
                  "대표 배송처(dpt_no) 확보 실패 (dpt_mst 선행 동기화 필요)",
                );
              }

              const payload = buildAddPayload({
                skuCd,
                prodNm: skuCd, // 운영 정책에 맞게 변경 가능 (예: gds_nm)
                costPrice,
                depotNo,
              });

              const result = await callPlayautoAdd(http, payload);

              if (result?.fail > 0) {
                const failItem = (result?.results || []).find(
                  (x) => x?.sku_cd === skuCd,
                );
                const msg = (failItem?.messages || []).join(" ");
                throw new Error(
                  `[PLAYAUTO ADD FAIL] ${failItem?.error_code || ""} ${msg}`.trim(),
                );
              }

              // 등록 성공 → sku_mst 반영은 02:00 SKU LIST SYNC가 다시 끌어옴
              stat.successCnt++;
            }
          } catch (err) {
            stat.failCnt++;
            console.error(
              "[JOB][PLAYAUTO][SKU_PRICE][FAIL]",
              g?.prodCd,
              err.message,
            );
          }
        }

        console.log(
          `[JOB][PLAYAUTO][SKU_PRICE] 완료 total=${stat.totalCnt}, success=${stat.successCnt}, fail=${stat.failCnt}, skip=${stat.skipCnt}`,
        );
      } finally {
        // advisory unlock
        try {
          await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
        } catch (e) {
          console.error("advisory unlock 실패:", e);
        }
      }
    },
  });
};
