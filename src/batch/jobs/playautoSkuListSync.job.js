const { executeBatch } = require("../framework/batchExecutor");
const {
  fetchPlayautoSkuList,
} = require("../../services/playautoSkuListService");

/**
 * PlayAuto SKU LIST 동기화 배치
 * - sku_mst / sku_optn_mst / sku_dpt_stk_mst 동기화
 * - 변경 시 his 테이블에 "변경 전 스냅샷" 기록
 * - 신규 시 INIT_SYNC 스냅샷 기록
 *
 * 전제:
 * - sku_mst: UNIQUE(sku_cd)
 * - dpt_mst: sol_no + dpt_no 로 dpt_id 매핑 가능
 * - pool.js 에서 rows camelCase 변환됨
 */
exports.run = async (type = "SKU_LIST_SYNC") => {
  return executeBatch({
    jobName: "PLAYAUTO_SKU_LIST_SYNC",
    runType: type,

    /**
     * client : 트랜잭션 DB 커넥션 (executeBatch에서 제공)
     * stat   : { totalCnt, successCnt, failCnt }
     */
    jobFn: async (client, stat) => {
      const LOCK_KEY = 888101;
      const ACTOR = "BATCH";

      // ---------- util ----------
      const toNum = (v, d = null) => {
        if (v === null || v === undefined || v === "") return d;
        const n = Number(v);
        return Number.isNaN(n) ? d : n;
      };

      const toInt = (v, d = 0) => {
        const n = parseInt(String(v ?? ""), 10);
        return Number.isNaN(n) ? d : n;
      };

      const normStr = (v) => (v === null || v === undefined ? "" : String(v));

      const eqNum = (a, b) => {
        const na = a === null || a === undefined || a === "" ? null : Number(a);
        const nb = b === null || b === undefined || b === "" ? null : Number(b);
        if (na === null && nb === null) return true;
        return na === nb;
      };

      const safeRow = (row) => row || {};

      // ---------- sku helpers ----------
      async function selectSkuBySkuCd(skuCd) {
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
          safe_stk_qty,
          use_yn,
          del_yn
        FROM sku_mst
       WHERE sku_cd = $1
         AND del_yn = 'N'
       LIMIT 1
      `,
          [skuCd],
        );
        return r.rows?.[0] || null;
      }

      function isSkuChanged(existing, incoming) {
        const e = safeRow(existing);
        const i = safeRow(incoming);

        if (!eqNum(e.solNo, i.sol_no)) return true;
        if (!eqNum(e.prodNo, i.prod_no)) return true;
        if (normStr(e.prodNm) !== normStr(i.prod_name)) return true;

        if (!eqNum(e.salePrcAmt, i.product_price)) return true;
        if (!eqNum(e.costPrcAmt, i.cost_price)) return true;
        if (!eqNum(e.suplPrcAmt, i.supply_price)) return true;

        if (normStr(e.brdNm) !== normStr(i.brand)) return true;
        if (normStr(e.mfrNm) !== normStr(i.maker)) return true;
        if (normStr(e.mdlNm) !== normStr(i.model)) return true;

        return false;
      }

      async function insertSkuHisFromMst(mstRow, reason) {
        const row = safeRow(mstRow);
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

      async function upsertSkuMst(existing, incoming) {
        const skuCd = incoming.sku_cd;
        const isNew = !existing;

        if (isNew) {
          await client.query(
            `
        INSERT INTO sku_mst (
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
            rgtr_id,
            del_yn,
            use_yn
        )
        VALUES (
            (SELECT fn_create_pk('SKU_MST')),
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            $11,'N','Y'
        )
        `,
            [
              incoming.sol_no,
              incoming.prod_no,
              incoming.sku_cd,
              incoming.prod_name,
              toNum(incoming.product_price, null),
              toNum(incoming.cost_price, null),
              toNum(incoming.supply_price, null),
              incoming.brand ?? null,
              incoming.maker ?? null,
              incoming.model ?? null,
              ACTOR,
            ],
          );

          const mst = await selectSkuBySkuCd(skuCd);
          if (!mst)
            throw new Error(`신규 sku_mst insert 후 조회 실패 sku_cd=${skuCd}`);

          // 신규 초기 스냅샷
          await insertSkuHisFromMst(mst, "INIT_SYNC");
          return mst;
        }

        // 기존 변경 감지 → 변경 전 스냅샷
        if (isSkuChanged(existing, incoming)) {
          await insertSkuHisFromMst(existing, "PLAYAUTO_SKU_LIST_SYNC");
        }

        await client.query(
          `
      UPDATE sku_mst
         SET sol_no       = $2,
             prod_no      = $3,
             prod_nm      = $4,
             sale_prc_amt = $5,
             cost_prc_amt = $6,
             supl_prc_amt = $7,
             brd_nm       = $8,
             mfr_nm       = $9,
             mdl_nm       = $10,
             del_yn       = 'N',
             use_yn       = 'Y',
             mdfcn_dt     = CURRENT_TIMESTAMP,
             mdfr_id      = $11
       WHERE sku_id = $1
      `,
          [
            existing.skuId,
            incoming.sol_no,
            incoming.prod_no,
            incoming.prod_name,
            toNum(incoming.product_price, null),
            toNum(incoming.cost_price, null),
            toNum(incoming.supply_price, null),
            incoming.brand ?? null,
            incoming.maker ?? null,
            incoming.model ?? null,
            ACTOR,
          ],
        );

        return await selectSkuBySkuCd(skuCd);
      }

      // ---------- option helpers ----------
      async function selectActiveOptions(skuId) {
        const r = await client.query(
          `
      SELECT
          sku_optn_id,
          sku_id,
          optn_seq,
          optn_nm,
          optn_type_cd,
          optn_val_cn
        FROM sku_optn_mst
       WHERE sku_id = $1
         AND del_yn = 'N'
       ORDER BY optn_seq ASC
      `,
          [skuId],
        );
        return r.rows || [];
      }

      function normalizeOptionsFromApi(apiOptions) {
        const arr = Array.isArray(apiOptions) ? apiOptions : [];
        return arr.map((o, idx) => ({
          optnSeq: idx + 1,
          optnNm: normStr(o?.attri),
          optnTypeCd: o?.attri_type ?? null,
          optnValCn: o?.attri ?? null,
        }));
      }

      function isOptionsChanged(dbOptions, apiOptionsNorm) {
        if ((dbOptions?.length || 0) !== (apiOptionsNorm?.length || 0))
          return true;

        for (let i = 0; i < apiOptionsNorm.length; i++) {
          const d = safeRow(dbOptions[i]);
          const a = safeRow(apiOptionsNorm[i]);

          if (toInt(d.optnSeq) !== toInt(a.optnSeq)) return true;
          if (normStr(d.optnNm) !== normStr(a.optnNm)) return true;
          if (normStr(d.optnTypeCd) !== normStr(a.optnTypeCd)) return true;
          if (normStr(d.optnValCn) !== normStr(a.optnValCn)) return true;
        }
        return false;
      }

      async function insertOptionHisSnapshot(dbOptions, reason) {
        for (const opt of dbOptions) {
          const o = safeRow(opt);
          await client.query(
            `
        INSERT INTO sku_optn_his (
            sku_optn_his_id,
            sku_optn_id,
            sku_id,
            optn_seq,
            optn_nm,
            optn_type_cd,
            optn_val_cn,
            chg_rsn_cn,
            rgtr_id,
            del_yn,
            use_yn
        )
        VALUES (
            (SELECT fn_create_pk('SKU_OPTN_HIS')),
            $1,$2,$3,$4,$5,$6,$7,
            $8,$9,'N','Y'
        )
        `,
            [
              o.skuOptnId,
              o.skuId,
              o.optnSeq,
              o.optnNm,
              o.optnTypeCd,
              o.optnValCn,
              reason,
              ACTOR,
            ],
          );
        }
      }

      async function replaceOptions(skuId, apiOptionsNorm, isNewSku) {
        const dbOptions = await selectActiveOptions(skuId);
        const changed = isNewSku
          ? apiOptionsNorm.length > 0
          : isOptionsChanged(dbOptions, apiOptionsNorm);

        if (!changed) return;

        // 기존이면 변경 전 스냅샷
        if (!isNewSku && dbOptions.length > 0) {
          await insertOptionHisSnapshot(dbOptions, "PLAYAUTO_SKU_LIST_SYNC");
        }

        // 기존 options soft delete
        await client.query(
          `
      UPDATE sku_optn_mst
         SET del_yn = 'Y',
             use_yn = 'N',
             mdfcn_dt = CURRENT_TIMESTAMP,
             mdfr_id = $2
       WHERE sku_id = $1
         AND del_yn = 'N'
      `,
          [skuId, ACTOR],
        );

        // 새 options insert
        for (const opt of apiOptionsNorm) {
          await client.query(
            `
        INSERT INTO sku_optn_mst (
            sku_optn_id,
            sku_id,
            optn_seq,
            optn_nm,
            optn_type_cd,
            optn_val_cn,
            rgtr_id,
            del_yn,
            use_yn
        )
        VALUES (
            (SELECT fn_create_pk('SKU_OPTN_MST')),
            $1,$2,$3,$4,$5,
            $6,'N','Y'
        )
        `,
            [
              skuId,
              opt.optnSeq,
              opt.optnNm,
              opt.optnTypeCd,
              opt.optnValCn,
              ACTOR,
            ],
          );
        }

        // 신규면 INIT 스냅샷도 남김
        if (isNewSku && apiOptionsNorm.length > 0) {
          const nowOptions = await selectActiveOptions(skuId);
          await insertOptionHisSnapshot(nowOptions, "INIT_SYNC");
        }
      }

      // ---------- depot stock helpers ----------
      async function selectActiveDepotStocks(skuId) {
        const r = await client.query(
          `
      SELECT
          sku_dpt_stk_id,
          sku_id,
          dpt_id,
          real_stk_qty,
          safe_stk_qty,
          out_lt_dy
        FROM sku_dpt_stk_mst
       WHERE sku_id = $1
         AND del_yn = 'N'
       ORDER BY dpt_id ASC
      `,
          [skuId],
        );
        return r.rows || [];
      }

      async function mapDepotNoToDptId(solNo, depotNo) {
        const r = await client.query(
          `
      SELECT dpt_id
        FROM dpt_mst
       WHERE sol_no = $1
         AND dpt_no = $2
         AND del_yn = 'N'
       LIMIT 1
      `,
          [solNo, depotNo],
        );
        return r.rows?.[0]?.dptId || null;
      }

      async function normalizeDepotStocksFromApi(solNo, apiDepots) {
        const arr = Array.isArray(apiDepots) ? apiDepots : [];
        const mapped = [];

        for (const d of arr) {
          const depotNo = d?.depot_no;
          const dptId = await mapDepotNoToDptId(solNo, depotNo);

          if (!dptId) {
            console.warn(
              `⚠️ [PLAYAUTO][SKU_LIST] 배송처 매핑 실패 sol_no=${solNo}, depot_no=${depotNo} (dpt_mst 선행 동기화 필요)`,
            );
            continue;
          }

          mapped.push({
            dptId,
            realStkQty: toNum(d?.real_stock, 0),
            safeStkQty: toNum(d?.safe_stock, 0),
            outLtDy:
              d?.out_leadtime === null || d?.out_leadtime === undefined
                ? null
                : toNum(d?.out_leadtime, null),
          });
        }

        mapped.sort((a, b) => normStr(a.dptId).localeCompare(normStr(b.dptId)));
        return mapped;
      }

      function isDepotStocksChanged(dbRows, apiRows) {
        if ((dbRows?.length || 0) !== (apiRows?.length || 0)) return true;

        for (let i = 0; i < apiRows.length; i++) {
          const d = safeRow(dbRows[i]);
          const a = safeRow(apiRows[i]);

          if (normStr(d.dptId) !== normStr(a.dptId)) return true;
          if (!eqNum(d.realStkQty, a.realStkQty)) return true;
          if (!eqNum(d.safeStkQty, a.safeStkQty)) return true;
          if (!eqNum(d.outLtDy, a.outLtDy)) return true;
        }
        return false;
      }

      async function insertDepotStockHisSnapshot(dbStocks, reason) {
        for (const st of dbStocks) {
          const s = safeRow(st);
          await client.query(
            `
        INSERT INTO sku_dpt_stk_his (
            sku_dpt_stk_his_id,
            sku_dpt_stk_id,
            sku_id,
            dpt_id,
            real_stk_qty,
            safe_stk_qty,
            out_lt_dy,
            chg_rsn_cn,
            rgtr_id,
            del_yn,
            use_yn
        )
        VALUES (
            (SELECT fn_create_pk('SKU_DPT_STK_HIS')),
            $1,$2,$3,$4,$5,$6,$7,
            $8,$9,'N','Y'
        )
        `,
            [
              s.skuDptStkId,
              s.skuId,
              s.dptId,
              s.realStkQty,
              s.safeStkQty,
              s.outLtDy,
              reason,
              ACTOR,
            ],
          );
        }
      }

      async function replaceDepotStocks(skuId, solNo, apiDepots, isNewSku) {
        const dbStocks = await selectActiveDepotStocks(skuId);
        const apiNorm = await normalizeDepotStocksFromApi(solNo, apiDepots);

        const changed = isNewSku
          ? apiNorm.length > 0
          : isDepotStocksChanged(dbStocks, apiNorm);
        if (!changed) return;

        if (!isNewSku && dbStocks.length > 0) {
          await insertDepotStockHisSnapshot(dbStocks, "PLAYAUTO_SKU_LIST_SYNC");
        }

        // 기존 stocks soft delete
        await client.query(
          `
      UPDATE sku_dpt_stk_mst
         SET del_yn = 'Y',
             use_yn = 'N',
             mdfcn_dt = CURRENT_TIMESTAMP,
             mdfr_id = $2
       WHERE sku_id = $1
         AND del_yn = 'N'
      `,
          [skuId, ACTOR],
        );

        // 새 stocks insert
        for (const st of apiNorm) {
          await client.query(
            `
        INSERT INTO sku_dpt_stk_mst (
            sku_dpt_stk_id,
            sku_id,
            dpt_id,
            real_stk_qty,
            safe_stk_qty,
            out_lt_dy,
            rgtr_id,
            del_yn,
            use_yn
        )
        VALUES (
            (SELECT fn_create_pk('SKU_DPT_STK_MST')),
            $1,$2,$3,$4,$5,
            $6,'N','Y'
        )
        `,
            [skuId, st.dptId, st.realStkQty, st.safeStkQty, st.outLtDy, ACTOR],
          );
        }

        // 신규면 INIT 스냅샷도 남김
        if (isNewSku && apiNorm.length > 0) {
          const nowStocks = await selectActiveDepotStocks(skuId);
          await insertDepotStockHisSnapshot(nowStocks, "INIT_SYNC");
        }
      }

      // ---------- run ----------
      const lockRes = await client.query(
        "SELECT pg_try_advisory_lock($1) AS locked",
        [LOCK_KEY],
      );

      if (!lockRes.rows?.[0]?.locked) {
        console.log("▶ [JOB][PLAYAUTO][SKU_LIST] 이미 실행중 (SKIP)");
        return;
      }

      try {
        const limit = 100;
        let start = 0;
        let total = 0;

        while (true) {
          // 90일 제한 회피: sdate 과거 고정
          const data = await fetchPlayautoSkuList(client, {
            start,
            limit,
            date_type: "wdate",
            sdate: "2000-01-01",
          });

          const results = Array.isArray(data.results) ? data.results : [];
          total = toInt(data.total, 0);

          console.log(
            `▶ [JOB][PLAYAUTO][SKU_LIST] page start=${start}, count=${results.length}, total=${total}`,
          );

          if (results.length === 0) break;

          for (const item of results) {
            stat.totalCnt++;

            try {
              const skuCd = item.sku_cd;
              if (!skuCd) throw new Error("sku_cd 누락");

              // 기존 SKU 조회
              const existing = await selectSkuBySkuCd(skuCd);

              // sku_mst upsert + sku_his 처리
              const mst = await upsertSkuMst(existing, item);
              if (!mst) throw new Error(`sku_mst upsert 실패 sku_cd=${skuCd}`);

              const skuId = mst.skuId;
              const isNewSku = !existing;

              // 옵션 동기화 + his
              const apiOptionsNorm = normalizeOptionsFromApi(item.options);
              await replaceOptions(skuId, apiOptionsNorm, isNewSku);

              // 배송처 재고 동기화 + his
              await replaceDepotStocks(
                skuId,
                item.sol_no,
                item.depots,
                isNewSku,
              );

              stat.successCnt++;
            } catch (e) {
              stat.failCnt++;
              console.error(
                `[JOB][PLAYAUTO][SKU_LIST][FAIL] sku_cd=${item?.sku_cd}`,
                e.message,
              );
            }
          }

          start += limit;
          if (total > 0 && start >= total) break;
        }

        console.log(
          `▶ [JOB][PLAYAUTO][SKU_LIST] 완료 total=${stat.totalCnt}, success=${stat.successCnt}, fail=${stat.failCnt}`,
        );
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
