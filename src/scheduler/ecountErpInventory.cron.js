const { CronJob } = require("cron");
const job = require("../batch/jobs/ecountErpInventory.job");
const config = require("../config");

const runJob = async (type) => {
  console.log(`[CRON][${type}] Inventory start`);
  try {
    await job.run(type);
    console.log(`[CRON][${type}] Inventory end`);
  } catch (err) {
    console.error(`[CRON][${type}] ERROR`, err);
  }
};

module.exports.start = () => {
  if (!config.batch.enabled) {
    console.log("[CRON] inventory batch disabled");
    return;
  }

  if (config.cron.inventory) {
    new CronJob(
      config.cron.inventory,
      () => runJob("INVENTORY"),
      null,
      true,
      "Asia/Seoul",
    );
    console.log("[CRON] inventory job registered:", config.cron.inventory);
  }

  if (config.cron.yesterdayInventory) {
    new CronJob(
      config.cron.yesterdayInventory,
      () => runJob("YESTERDAY_INVENTORY"),
      null,
      true,
      "Asia/Seoul",
    );
    console.log(
      "[CRON] yesterday inventory job registered:",
      config.cron.yesterdayInventory,
    );
  }
};
