const dayjs = require("dayjs");
const { executeBatch } = require("../framework/batchExecutor");
const {
  fetchPlayautoStockCondition,
} = require("../../services/playautoStockConditionService");
const { getPlayautoAuth } = require("../../services/playautoTokenService");

/**
 * PlayAuto 재고현황 스냅샷 적재
 * - STK_COND_HIST (PK: bs_ymd, sku_cd, dpt_no)
 */
exports.run = async (type = "STOCK_COND_SYNC") => {
  return executeBatch({
    jobName: "PLAYAUTO_STOCK_CONDITION_SYNC",
    runType: type,

    jobFn: async (client, stat) => {
      const LOCK_KEY = 888201;
      const ACTOR = "BATCH";
      const TEST_TARGET_PROD_CDS = [
        "8809615362129",
        "880961534161",
        "8809615364178",
      ];

      // 동시 실행 방지
      const lockRes = await client.query(
        "SELECT pg_try_advisory_lock($1) AS locked",
        [LOCK_KEY],
      );

      if (!lockRes.rows?.[0]?.locked) {
        console.log("▶ [JOB][PLAYAUTO][STK_COND] 이미 실행중 (SKIP)");
        return;
      }

      try {
        await client.query("BEGIN");

        // 토큰/sol_no 확보(미리)
        const { solNo } = await getPlayautoAuth(client);
        if (!solNo) throw new Error("PlayAuto sol_no 확보 실패");

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

        const targetProdRes = await client.query(
          `
          SELECT prod_cd
            FROM gds_mst
           WHERE del_yn = 'N'
             AND use_yn = 'Y'
             AND prod_cd = ANY($1)
          `,
          [TEST_TARGET_PROD_CDS],
        );

        const targetProdCdSet = new Set(
          (targetProdRes.rows || []).map((row) => String(row.prodCd || "")),
        );

        console.log(
          `[JOB][PLAYAUTO][STK_COND] 테스트 대상 prod_cd=${Array.from(targetProdCdSet).join(", ")}`,
        );

        const limit = 100;
        let start = 0;
        let recordsTotal = 0;

        while (true) {
          const data = await fetchPlayautoStockCondition(client, {
            start,
            limit,
            // 90일 제한 회피 필요하면 강제 과거 설정
            date_type: "wdate",
            sdate: "2000-01-01",
            orderbyColumn: "wdate",
            orderbyType: "DESC",
            search_key: "all",
            search_word: "",
            search_type: "partial",
          });

          const results = Array.isArray(data.results) ? data.results : [];
          recordsTotal = Number(data.recordsTotal || 0);

          console.log(
            `▶ [JOB][PLAYAUTO][STK_COND] page start=${start}, count=${results.length}, total=${recordsTotal}`,
          );

          if (results.length === 0) break;

          for (const r of results) {
            const skuCd = String(r?.sku_cd || "");

            if (!targetProdCdSet.has(skuCd)) {
              continue;
            }

            stat.totalCnt++;

            try {
              const skuCd = r.sku_cd;
              const dptNo = r.depot_no;

              if (!skuCd) throw new Error("sku_cd 누락");
              if (dptNo === null || dptNo === undefined)
                throw new Error("depot_no 누락");

              // API → 표준 약어 컬럼 매핑
              const row = {
                bsYmd,
                skuCd,
                dptNo: Number(dptNo),
                solNo: Number(r.sol_no ?? solNo), // 응답에 sol_no가 있으면 우선
                gdsNo:
                  r.prod_no !== null && r.prod_no !== undefined
                    ? Number(r.prod_no)
                    : null,
                gdsNm: r.prod_name ?? null,
                stkStsCd: r.stock_status ?? null,
                realStkQty: Number(r.stock_cnt_real ?? 0),
                salePosStkQty: Number(r.stock_cnt ?? 0),
                safeStkQty: Number(r.stock_cnt_safe ?? 0),
              };

              await client.query(
                `
                INSERT INTO stk_cond_hist (
                    bs_ymd,
                    sku_cd,
                    dpt_no,
                    sol_no,
                    gds_no,
                    gds_nm,
                    stk_sts_cd,
                    real_stk_qty,
                    sale_pos_stk_qty,
                    safe_stk_qty,
                    reg_dt,
                    rgtr_id,
                    del_yn,
                    use_yn
                )
                VALUES (
                    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
                    CURRENT_TIMESTAMP,
                    $11,
                    'N',
                    'Y'
                )
                ON CONFLICT (bs_ymd, sku_cd, dpt_no)
                DO UPDATE SET
                    sol_no           = EXCLUDED.sol_no,
                    gds_no           = EXCLUDED.gds_no,
                    gds_nm           = EXCLUDED.gds_nm,
                    stk_sts_cd       = EXCLUDED.stk_sts_cd,
                    real_stk_qty     = EXCLUDED.real_stk_qty,
                    sale_pos_stk_qty = EXCLUDED.sale_pos_stk_qty,
                    safe_stk_qty     = EXCLUDED.safe_stk_qty,
                    del_yn           = 'N',
                    use_yn           = 'Y',
                    mdfcn_dt         = CURRENT_TIMESTAMP,
                    mdfr_id          = $11
                `,
                [
                  row.bsYmd,
                  row.skuCd,
                  row.dptNo,
                  row.solNo,
                  row.gdsNo,
                  row.gdsNm,
                  row.stkStsCd,
                  row.realStkQty,
                  row.salePosStkQty,
                  row.safeStkQty,
                  ACTOR,
                ],
              );

              stat.successCnt++;
            } catch (e) {
              stat.failCnt++;
              console.error(
                `[JOB][PLAYAUTO][STK_COND][FAIL] sku_cd=${r?.sku_cd}, depot_no=${r?.depot_no}`,
                e.message,
              );
            }
          }

          start += limit;
          if (recordsTotal > 0 && start >= recordsTotal) break;
        }

        await client.query("COMMIT");
        console.log(
          `▶ [JOB][PLAYAUTO][STK_COND] 완료 total=${stat.totalCnt}, success=${stat.successCnt}, fail=${stat.failCnt}`,
        );
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {}
        console.error("❌ [JOB][PLAYAUTO][STK_COND] 실패:", err);
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
