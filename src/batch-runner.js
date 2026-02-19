const path = require("path");

// 🔥 NODE_ENV 기반으로 env 파일 로드
const env = process.env.NODE_ENV || "local";

require("dotenv").config({
  path: path.resolve(process.cwd(), `.env.${env}`),
});

console.log(`[ENV] Loaded .env.${env}`);

// ===============================
// Batch Jobs
// ===============================
const shoppingRankJob = require("./batch/jobs/shoppingRank.job");
const ecountErpProductJob = require("./batch/jobs/ecountErpProduct.job");

(async () => {
  try {
    console.log("==========================================");
    console.log("[BATCH] START");
    console.log("==========================================");

    // 1️⃣ 쇼핑 랭킹 배치
    console.log("▶ [JOB] Shopping Rank Batch START");
    await shoppingRankJob.run();
    console.log("✔ [JOB] Shopping Rank Batch END");

    // 2️⃣ 이카운트 ERP 품목 배치
    console.log("▶ [JOB] Ecount ERP Product Batch START");
    await ecountErpProductJob.run();
    console.log("✔ [JOB] Ecount ERP Product Batch END");

    console.log("==========================================");
    console.log("[BATCH] ALL JOBS COMPLETED");
    console.log("==========================================");

    process.exit(0);
  } catch (e) {
    console.error("==========================================");
    console.error("❌ [BATCH] FAILED");
    console.error(e);
    console.error("==========================================");
    process.exit(1);
  }
})();
