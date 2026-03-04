const { CronJob } = require("cron");
const job = require("../batch/jobs/ecountErpTodayInventory.job");
const config = require("../config");

const runJob = async (type) => {
  console.log(`[CRON][${type}] ECOUNT TODAY INVENTORY START`);
  try {
    const result = await job.run();
    console.log(`[CRON][${type}] ECOUNT TODAY INVENTORY END`, result);
  } catch (err) {
    console.error(`[CRON][${type}] ERROR`, err);
  }
};

module.exports.start = () => {
  if (!config.batch.enabled) {
    console.log("[CRON][ECOUNT_TODAY_INV] batch disabled");
    return;
  }

  if (!config.cron.ecountTodayInventory) {
    console.log("[CRON][ECOUNT_TODAY_INV] cron not configured");
    return;
  }

  new CronJob(
    config.cron.ecountTodayInventory,
    () => runJob("BATCH_SYSTEM"),
    null,
    true,
    config.batch.timezone, // ✅ Asia/Seoul
  );

  console.log(
    "[CRON][ECOUNT_TODAY_INV] job registered:",
    config.cron.ecountTodayInventory,
  );
};
