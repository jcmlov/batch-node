const { CronJob } = require("cron");
const config = require("../config");
const job = require("../batch/jobs/playautoStockManageApply.job");

const runJob = async (type) => {
  console.log(`[CRON][${type}] PLAYAUTO STOCK_MANAGE START`);
  try {
    const result = await job.run(type);
    console.log(`[CRON][${type}] PLAYAUTO STOCK_MANAGE END`, result);
  } catch (err) {
    console.error(`[CRON][${type}] PLAYAUTO STOCK_MANAGE ERROR`, err);
  }
};

module.exports.start = () => {
  if (!config.batch.enabled) {
    console.log("[CRON][PLAYAUTO_STK_MNG] batch disabled");
    return;
  }

  if (!config.cron.playautoStockManage) {
    console.log("[CRON][PLAYAUTO_STK_MNG] cron not configured");
    return;
  }

  new CronJob(
    config.cron.playautoStockManage,
    () => runJob("BATCH_SYSTEM"),
    null,
    true,
    config.batch.timezone || "Asia/Seoul",
  );

  console.log(
    "[CRON][PLAYAUTO_STK_MNG] job registered:",
    config.cron.playautoStockManage,
  );
};
