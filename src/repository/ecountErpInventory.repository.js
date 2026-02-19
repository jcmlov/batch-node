const pool = require("../db/pool");

/**
 * 이카운트 ERP 재고 UPSERT
 * @param {Object} item - 재고 데이터
 * @param {string} rgtrId - 등록자 ID (ex: BATCH_SYSTEM)
 */
async function upsertInventory(item, rgtrId) {
  const sql = `
    INSERT INTO inv_sts_hist
    (
        base_ymd,
        prod_cd,
        whs_cd,
        whs_nm,
        whlo_qty,
        reg_dt,
        rgtr_id,
        del_yn
    )
    VALUES
    (
        $1,
        $2,
        $3,
        $4,
        $5,
        CURRENT_TIMESTAMP,
        $6,
        'N'
    )
    ON CONFLICT (base_ymd, prod_cd)
    DO UPDATE SET
        whs_cd   = EXCLUDED.whs_cd,
        whs_nm   = EXCLUDED.whs_nm,
        whlo_qty = EXCLUDED.whlo_qty,
        mdfcn_dt = CURRENT_TIMESTAMP,
        mdfr_id  = $6,
        del_yn   = 'N'
  `;

  const params = [
    item.baseYmd, // yyyyMMdd
    item.prodCd, // 품목코드
    item.whsCd, // 창고코드
    item.whsNm, // 창고명
    item.whloQty, // 재고수량
    rgtrId,
  ];

  await pool.query(sql, params);
}

/**
 * 누락된 재고 기준일 조회
 * @returns {string|null} yyyyMMdd
 */
async function selectMissingInventoryDate() {
  const sql = `
    SELECT to_char(d, 'YYYYMMDD') AS base_ymd
      FROM generate_series
           (
             DATE '2024-01-01',
             CURRENT_DATE - INTERVAL '1 day',
             INTERVAL '1 day'
           ) d
 LEFT JOIN (
        SELECT DISTINCT base_ymd
          FROM inv_sts_hist
         WHERE del_yn = 'N'
      ) i
        ON i.base_ymd = to_char(d, 'YYYYMMDD')
     WHERE i.base_ymd IS NULL
  ORDER BY d DESC
     LIMIT 1
  `;

  const res = await pool.query(sql);
  return res.rows[0]?.baseYmd || null;
}

module.exports = {
  upsertInventory,
  selectMissingInventoryDate,
};
