const pool = require("../db/pool");

/**
 * 이카운트 ERP 상품 UPSERT
 * @param {Object} item - 이카운트 ERP 상품 데이터
 * @param {string} rgtrId - 등록자 ID (ex: BATCH_SYSTEM)
 */
async function upsertProduct(item, rgtrId) {
  const sql = `
    INSERT INTO gds_mst
    (
        gds_id,
        sku_id,
        prod_cd,
        gds_nm,
        size_des,
        unit,
        bal_flag,
        reg_dt,
        rgtr_id,
        del_yn
    )
    VALUES
    (
        (SELECT fn_create_pk('GDS_MST')),
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        CURRENT_TIMESTAMP,
        $7,
        'N'
    )
    ON CONFLICT (prod_cd)
    DO UPDATE SET
        gds_nm   = EXCLUDED.gds_nm,
        size_des = EXCLUDED.size_des,
        unit     = EXCLUDED.unit,
        bal_flag = EXCLUDED.bal_flag,
        mdfcn_dt = CURRENT_TIMESTAMP,
        mdfr_id  = $7,
        del_yn   = 'N'
  `;

  const params = [
    item.prodCd, // camelcase-keys 적용됨
    item.cont1,
    item.prodNm,
    item.sizeDes,
    item.unit,
    item.balFlag,
    rgtrId,
  ];

  await pool.query(sql, params);
}

module.exports = {
  upsertProduct,
};
