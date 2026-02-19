const pool = require("../db/pool");

/**
 * 배치 실행 시작 로그
 */
async function insertJobStart({ jobName, runType, baseYmd }) {
  const sql = `
    INSERT INTO batch_job_exec
    (job_name, run_type, base_ymd, status)
    VALUES ($1, $2, $3, 'RUNNING')
    RETURNING exec_id
  `;

  const { rows } = await pool.query(sql, [jobName, runType, baseYmd]);

  return rows[0].exec_id;
}

/**
 * 배치 실행 종료 로그
 */
async function updateJobEnd(execId, result) {
  const {
    status,
    totalCnt = 0,
    successCnt = 0,
    failCnt = 0,
    errorMsg = null,
  } = result;

  const sql = `
    UPDATE batch_job_exec
       SET status      = $1,
           total_cnt   = $2,
           success_cnt = $3,
           fail_cnt    = $4,
           end_dt      = CURRENT_TIMESTAMP,
           error_msg   = $5
     WHERE exec_id     = $6
  `;

  await pool.query(sql, [
    status,
    totalCnt,
    successCnt,
    failCnt,
    errorMsg,
    execId,
  ]);
}

module.exports = {
  insertJobStart,
  updateJobEnd,
};
