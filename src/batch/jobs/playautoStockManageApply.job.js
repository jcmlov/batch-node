const dayjs = require("dayjs");
const { executeBatch } = require("../framework/batchExecutor");
const { getPlayautoAuth } = require("../../services/playautoTokenService");
const {
  applyPlayautoRealStockDelta,
} = require("../../services/playautoStockManageService");

exports.run = async (type = "STOCK_MANAGE_APPLY") => {
  return executeBatch({
    jobName: "PLAYAUTO_STOCK_MANAGE_APPLY",
    runType: type,

    jobFn: async (client, stat) => {
      const LOCK_KEY = 888202;
      const ACTOR = "BATCH";
      const TEST_TARGET_PROD_CDS = [
        "8809615362129",
        "880961534161",
        "8809615364178",
      ];

      const today = dayjs().format("YYYYMMDD");
      const yesterday = dayjs().subtract(1, "day").format("YYYYMMDD");

      const check = await client.query(
        `
        SELECT 1
            FROM inv_sts_hist
        WHERE base_ymd = $1
            AND del_yn = 'N'
        LIMIT 1
        `,
        [today],
      );

      const bsYmd = check.rows.length ? today : yesterday;

      console.log(`[STOCK_SYNC] 기준일=${bsYmd}`);

      console.log(
        `[JOB][PLAYAUTO][STK_MNG] 테스트 대상 prod_cd=${TEST_TARGET_PROD_CDS.join(", ")}`,
      );

      const lockRes = await client.query(
        "SELECT pg_try_advisory_lock($1) AS locked",
        [LOCK_KEY],
      );
      if (!lockRes.rows?.[0]?.locked) {
        console.log("▶ [JOB][PLAYAUTO][STK_MNG] 이미 실행중 (SKIP)");
        return;
      }

      try {
        await client.query("BEGIN");

        const { solNo } = await getPlayautoAuth(client);
        if (!solNo) throw new Error("PlayAuto sol_no 확보 실패");

        // 기본 배송처
        const dptRes = await client.query(
          `
          SELECT dpt_no
            FROM dpt_mst
           WHERE sol_no = $1
             AND del_yn = 'N'
             AND use_yn = 'Y'
           ORDER BY (CASE WHEN dflt_yn = 'Y' THEN 0 ELSE 1 END), reg_dt DESC
           LIMIT 1
          `,
          [solNo],
        );
        const dptNo = dptRes.rows?.[0]?.dptNo;
        if (dptNo === null || dptNo === undefined) {
          throw new Error("기본 배송처(dpt_no) 조회 실패");
        }

        // PlayAuto 스냅샷
        const paRes = await client.query(
          `
          SELECT sku_cd, real_stk_qty
            FROM stk_cond_hist
           WHERE bs_ymd = $1
             AND sol_no = $2
             AND dpt_no = $3
             AND del_yn = 'N'
          `,
          [bsYmd, solNo, dptNo],
        );

        const paMap = new Map();
        for (const r of paRes.rows || []) {
          paMap.set(String(r.skuCd), Number(r.realStkQty ?? 0));
        }
        if (paMap.size === 0) {
          throw new Error("STK_COND_HIST 스냅샷 비어있음 (선행 배치 필요)");
        }

        // Ecount 재고(오늘)
        const ecRes = await client.query(
          `
          SELECT prod_cd, whlo_qty
            FROM inv_sts_hist
           WHERE base_ymd = $1
             AND del_yn = 'N'
             AND prod_cd = ANY($2)
          `,
          [bsYmd, TEST_TARGET_PROD_CDS],
        );

        for (const r of ecRes.rows || []) {
          stat.totalCnt++;

          const skuCd = String(r.prodCd || "");
          if (!skuCd) {
            stat.failCnt++;
            continue;
          }

          // 매칭 안되면 skip
          if (!paMap.has(skuCd)) {
            console.warn(`⚠️ [SKIP] PlayAuto 스냅샷에 sku_cd 없음: ${skuCd}`);
            stat.failCnt++;
            continue;
          }

          const ecQtyRaw = Number(r.whloQty ?? 0);
          const paQtyRaw = Number(paMap.get(skuCd) ?? 0);

          // ⚠️ 정책: 재고는 정수로 강제(필요시 바꾸자)
          const ecQty = Math.trunc(ecQtyRaw);
          const paQty = Math.trunc(paQtyRaw);

          const diff = ecQty - paQty;
          if (diff === 0) {
            stat.successCnt++;
            continue;
          }

          const aplyTpCd = diff > 0 ? "입고" : "출고";
          const aplyQty = Math.abs(diff);

          // ✅ 중복 적용 방지: 이미 성공 기록 있으면 스킵
          const dup = await client.query(
            `
            SELECT 1
              FROM stk_mng_aply_hist
             WHERE bs_ymd = $1
               AND sol_no = $2
               AND dpt_no = $3
               AND sku_cd = $4
               AND aply_rslt_cd = '성공'
               AND del_yn = 'N'
             LIMIT 1
            `,
            [bsYmd, solNo, dptNo, skuCd],
          );
          if (dup.rows?.length) {
            console.log(`▶ [SKIP][DUP] ${bsYmd} ${skuCd} 이미 성공 적용됨`);
            stat.successCnt++;
            continue;
          }

          let rsltCd = "실패";
          let msg = null;

          try {
            const res = await applyPlayautoRealStockDelta(client, {
              skuCd,
              dptNo,
              type: aplyTpCd,
              count: aplyQty,
            });

            if (res?.result && res.result !== "성공") {
              msg = JSON.stringify(res);
              throw new Error(`PlayAuto 재고수정 실패 응답: ${msg}`);
            }

            rsltCd = "성공";
            msg = res ? JSON.stringify(res) : null;

            stat.successCnt++;
          } catch (e) {
            msg = e.message;
            stat.failCnt++;
            console.error(`[FAIL][STK_MNG] sku_cd=${skuCd}`, e.message);
          }

          // ✅ 이력 UPSERT (성공/실패 모두 저장)
          await client.query(
            `
            INSERT INTO stk_mng_aply_hist (
                bs_ymd, sol_no, dpt_no, sku_cd,
                ec_stk_qty, pa_stk_qty, aply_qty, aply_tp_cd,
                aply_rslt_cd, aply_msg,
                reg_dt, rgtr_id, del_yn, use_yn
            )
            VALUES (
                $1,$2,$3,$4,
                $5,$6,$7,$8,
                $9,$10,
                CURRENT_TIMESTAMP,$11,'N','Y'
            )
            ON CONFLICT (bs_ymd, sol_no, dpt_no, sku_cd)
            DO UPDATE SET
                ec_stk_qty    = EXCLUDED.ec_stk_qty,
                pa_stk_qty    = EXCLUDED.pa_stk_qty,
                aply_qty      = EXCLUDED.aply_qty,
                aply_tp_cd    = EXCLUDED.aply_tp_cd,
                aply_rslt_cd  = EXCLUDED.aply_rslt_cd,
                aply_msg      = EXCLUDED.aply_msg,
                del_yn        = 'N',
                use_yn        = 'Y',
                mdfcn_dt      = CURRENT_TIMESTAMP,
                mdfr_id       = $11
            `,
            [
              bsYmd,
              solNo,
              dptNo,
              skuCd,
              ecQtyRaw,
              paQtyRaw,
              aplyQty,
              aplyTpCd,
              rsltCd,
              msg,
              ACTOR,
            ],
          );
        }

        await client.query("COMMIT");
        console.log(
          `▶ [JOB][PLAYAUTO][STK_MNG] 완료 total=${stat.totalCnt}, success=${stat.successCnt}, fail=${stat.failCnt}`,
        );
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {}
        console.error("❌ [JOB][PLAYAUTO][STK_MNG] 실패:", err);
        throw err;
      } finally {
        try {
          await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
        } catch (e) {
          console.error("advisory unlock 실패:", e);
        }
      }
    },
  });
};
