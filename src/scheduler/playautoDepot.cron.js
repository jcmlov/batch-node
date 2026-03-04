const { CronJob } = require("cron");
const { playautoDepotSyncJob } = require("../batch/jobs/playautoDepotSync.job");
const config = require("../config");

const runJob = async (type) => {
  console.log(`[CRON][${type}] PLAYAUTO DPT SYNC START`);

  try {
    await playautoDepotSyncJob();
    console.log(`[CRON][${type}] PLAYAUTO DPT SYNC END`);
  } catch (err) {
    console.error(`[CRON][${type}] PLAYAUTO DPT SYNC ERROR`, err);
  }
};

module.exports.start = () => {
  // ✅ 전체 배치 활성화 여부
  if (!config.batch.enabled) {
    console.log("[CRON][PLAYAUTO_DPT] batch disabled");
    return;
  }

  // ✅ PlayAuto DPT cron 설정 확인
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
