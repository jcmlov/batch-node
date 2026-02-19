const pool = require("../db/pool");

exports.selectRankTargets = async (client) => {
  const sql = `
SELECT gskm.gds_id,
skm.srch_kwd_id,
skm.srch_kwd_nm,
sm.stor_id,
sm.stor_nm
FROM SRCH_KWD_MST skm
JOIN GDS_SRCH_KWD_MAP gskm ON skm.srch_kwd_id = gskm.srch_kwd_id
JOIN GDS_STOR_MAP gsm ON gskm.gds_id = gsm.gds_id AND gsm.del_yn='N'
JOIN STOR_MST sm ON gsm.stor_id = sm.stor_id
WHERE gskm.del_yn='N' AND sm.del_yn='N'
`;
  const { rows } = await client.query(sql);
  return rows;
};

exports.insertRankHistory = async (p) => {
  const sql = `
INSERT INTO SHP_RANK_HST (
shp_rank_hst_id, srch_kwd_id, nvr_prd_id, prd_nm,
exp_rank_no, srch_cnt, reg_dt, rgtr_id
) VALUES (
(SELECT fn_create_pk('SHP_RANK_HST')),
$1,$2,$3,$4,$5,CURRENT_TIMESTAMP,$6
)
`;
  await pool.query(sql, [
    p.srchKwdId,
    p.nvrPrdId,
    p.prdNm,
    p.expRankNo,
    p.srchCnt,
    p.rgtrId,
  ]);
};
