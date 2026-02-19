const { CronJob } = require("cron");
const job = require("../batch/jobs/ecountErpProduct.job");
const config = require("../config");

const runJob = async (type) => {
  console.log(`[CRON][${type}] ECOUNT ERP START`);
  try {
    const result = await job.run(type);
    console.log(`[CRON][${type}] ECOUNT ERP END`, result);
  } catch (err) {
    console.error(`[CRON][${type}] ERROR`, err);
  }
};

module.exports.start = () => {
  // ✅ 전체 배치 활성화 여부
  if (!config.batch.enabled) {
    console.log("[CRON][ECOUNT] batch disabled");
    return;
  }

  // ✅ 이카운트 전용 cron 설정
  if (!config.cron.ecountErp) {
    console.log("[CRON][ECOUNT] cron not configured");
    return;
  }

  new CronJob(config.cron.ecountErp, () => runJob("BATCH_SYSTEM")).start();

  console.log("[CRON][ECOUNT] job registered:", config.cron.ecountErp);
};
