const { CronJob } = require("cron");
const job = require("../batch/jobs/playautoSkuListSync.job");
const config = require("../config");

const runJob = async (type) => {
  console.log(`[CRON][${type}] PLAYAUTO SKU LIST START`);
  try {
    const result = await job.run(type);
    console.log(`[CRON][${type}] PLAYAUTO SKU LIST END`, result);
  } catch (err) {
    console.error(`[CRON][${type}] ERROR`, err);
  }
};

module.exports.start = () => {
  if (!config.batch.enabled) {
    console.log("[CRON][PLAYAUTO_SKU_LIST] batch disabled");
    return;
  }

  if (!config.cron.playautoSkuList) {
    console.log("[CRON][PLAYAUTO_SKU_LIST] cron not configured");
    return;
  }

  new CronJob(
    config.cron.playautoSkuList,
    () => runJob("BATCH_SYSTEM"),
    null,
    true,
    config.batch.timezone,
  );

  console.log(
    "[CRON][PLAYAUTO_SKU_LIST] job registered:",
    config.cron.playautoSkuList,
  );
};
