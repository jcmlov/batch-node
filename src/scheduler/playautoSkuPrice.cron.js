const { CronJob } = require("cron");
const job = require("../batch/jobs/playautoSkuPriceSync.job");
const config = require("../config");

const runJob = async (type) => {
  console.log(`[CRON][${type}] PLAYAUTO SKU PRICE START`);
  try {
    const result = await job.run(type);
    console.log(`[CRON][${type}] PLAYAUTO SKU PRICE END`, result);
  } catch (err) {
    console.error(`[CRON][${type}] PLAYAUTO SKU PRICE ERROR`, err);
  }
};

module.exports.start = () => {
  // ✅ 전체 배치 활성화 여부
  if (!config.batch.enabled) {
    console.log("[CRON][PLAYAUTO_SKU_PRICE] batch disabled");
    return;
  }

  // ✅ 플레이오토 SKU 단가 동기화 cron 설정
  if (!config.cron.playautoSkuPrice) {
    console.log("[CRON][PLAYAUTO_SKU_PRICE] cron not configured");
    return;
  }

  new CronJob(
    config.cron.playautoSkuPrice,
    () => runJob("BATCH_SYSTEM"),
    null,
    true,
    config.batch.timezone, // ✅ Asia/Seoul
  );

  console.log(
    "[CRON][PLAYAUTO_SKU_PRICE] job registered:",
    config.cron.playautoSkuPrice,
  );
};
