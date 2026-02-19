const pool = require("../../db/pool");

async function executeBatch({
  jobName,
  runType = "MANUAL",
  baseYmd = null,
  jobFn,
}) {
  const client = await pool.connect();
  let execId;

  const stat = {
    totalCnt: 0,
    successCnt: 0,
    failCnt: 0,
  };

  try {
    const res = await client.query(
      `
      INSERT INTO batch_job_exec
      (job_name, run_type, base_ymd, status)
      VALUES ($1, $2, $3, 'RUNNING')
      RETURNING exec_id
      `,
      [jobName, runType, baseYmd],
    );

    execId = res.rows[0].execId;

    console.log(`▶ [BATCH][${jobName}] EXEC_ID=${execId} START (${runType})`);

    await client.query("BEGIN");

    await jobFn(client, stat);

    let status = "SUCCESS";
    if (stat.failCnt > 0 && stat.successCnt > 0) status = "PARTIAL";
    if (stat.failCnt > 0 && stat.successCnt === 0) status = "FAIL";

    await client.query("COMMIT");

    await client.query(
      `
      UPDATE batch_job_exec
      SET
        status = $1,
        total_cnt = $2,
        success_cnt = $3,
        fail_cnt = $4,
        end_dt = CURRENT_TIMESTAMP
      WHERE exec_id = $5
      `,
      [status, stat.totalCnt, stat.successCnt, stat.failCnt, execId],
    );

    return { execId, status, ...stat };
  } catch (err) {
    await client.query("ROLLBACK");

    if (execId) {
      await client.query(
        `
        UPDATE batch_job_exec
        SET
          status = 'FAIL',
          error_msg = $1,
          end_dt = CURRENT_TIMESTAMP
        WHERE exec_id = $2
        `,
        [err.message.substring(0, 4000), execId],
      );
    }

    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  executeBatch,
};
