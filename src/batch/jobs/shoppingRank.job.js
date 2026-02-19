const repo = require("../../repository/rank.repository");
const step = require("../steps/collectNaverRank.step");
const { executeBatch } = require("../framework/batchExecutor");

/**
 * 네이버 쇼핑 랭크 수집 배치
 */
exports.run = async (batchType = "MANUAL") => {
  return executeBatch({
    jobName: "NAVER_SHOPPING_RANK",
    runType: batchType,

    jobFn: async (client, stat) => {
      console.log(`[JOB][RANK] ShoppingRank run type = ${batchType}`);

      // =====================================================
      // 1️⃣ 수집 대상 조회
      // =====================================================
      const targets = await repo.selectRankTargets(client);

      // 👉 전체 대상 수
      stat.totalCnt = targets.length;

      // =====================================================
      // 2️⃣ 타겟별 랭크 수집
      // =====================================================
      for (const target of targets) {
        try {
          await step(target, batchType);

          stat.successCnt++;
        } catch (err) {
          stat.failCnt++;

          // 👉 개별 타겟 실패는 로그만 남기고 계속
          console.error(
            `[JOB][RANK] 실패 target=${target.keyword || target.id}`,
            err.message,
          );
        }
      }

      console.log(
        `[JOB][RANK] 처리 완료 total=${stat.totalCnt}, success=${stat.successCnt}, fail=${stat.failCnt}`,
      );
    },
  });
};
