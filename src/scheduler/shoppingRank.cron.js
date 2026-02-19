const { CronJob } = require("cron");
const job = require("../batch/jobs/shoppingRank.job");
const config = require("../config");

const runJob = async (type) => {
  console.log(`[CRON][${type}] ShoppingRank start`);
  try {
    await job.run(type);
    console.log(`[CRON][${type}] ShoppingRank end`);
  } catch (err) {
    console.error(`[CRON][${type}] ERROR`, err);
  }
};

module.exports.start = () => {
  if (!config.batch.enabled) {
    console.log("[CRON] batch disabled");
    return;
  }

  if (config.cron.morning) {
    new CronJob(config.cron.morning, () => runJob("MORNING")).start();
    console.log("[CRON] morning job registered:", config.cron.morning);
  }

  if (config.cron.afternoon) {
    new CronJob(config.cron.afternoon, () => runJob("AFTERNOON")).start();
    console.log("[CRON] afternoon job registered:", config.cron.afternoon);
  }
};
