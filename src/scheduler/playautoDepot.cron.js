const { CronJob } = require("cron");
const job = require("../batch/jobs/playautoDepotSync.job");
const config = require("../config");

const runJob = async (type) => {
  console.log(`[CRON][${type}] PLAYAUTO DPT SYNC START`);

  try {
    const result = await job.run(type);
    console.log(`[CRON][${type}] PLAYAUTO DPT SYNC END`, result);
  } catch (err) {
    console.error(`[CRON][${type}] PLAYAUTO DPT SYNC ERROR`, err);
  }
};

module.exports.start = () => {
  if (!config.batch.enabled) {
    console.log("[CRON][PLAYAUTO_DPT] batch disabled");
    return;
  }

  if (!config.cron.playautoDepot) {
    console.log("[CRON][PLAYAUTO_DPT] cron not configured");
    return;
  }

  new CronJob(
    config.cron.playautoDepot,
    () => runJob("BATCH_SYSTEM"),
    null,
    true,
    config.batch.timezone,
  );

  console.log(
    "[CRON][PLAYAUTO_DPT] job registered:",
    config.cron.playautoDepot,
  );
};
