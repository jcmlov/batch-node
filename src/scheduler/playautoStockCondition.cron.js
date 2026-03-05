const { CronJob } = require("cron");
const config = require("../config");
const job = require("../batch/jobs/playautoStockConditionSync.job");

const runJob = async (type) => {
  console.log(`[CRON][${type}] PLAYAUTO STOCK_COND START`);
  try {
    const result = await job.run(type);
    console.log(`[CRON][${type}] PLAYAUTO STOCK_COND END`, result);
  } catch (err) {
    console.error(`[CRON][${type}] PLAYAUTO STOCK_COND ERROR`, err);
  }
};

module.exports.start = () => {
  if (!config.batch.enabled) {
    console.log("[CRON][PLAYAUTO_STK_COND] batch disabled");
    return;
  }

  if (!config.cron.playautoStockCond) {
    console.log("[CRON][PLAYAUTO_STK_COND] cron not configured");
    return;
  }

  new CronJob(
    config.cron.playautoStockCond,
    () => runJob("BATCH_SYSTEM"),
    null,
    true,
    config.batch.timezone || "Asia/Seoul",
  );

  console.log(
    "[CRON][PLAYAUTO_STK_COND] job registered:",
    config.cron.playautoStockCond,
  );
};
