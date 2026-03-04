const repo = require("../../repository/ecountErpInventory.repository");
const EcountBasic = require("../ecount/ecount.basic");
const axios = require("axios");
const camelcaseKeys = require("camelcase-keys");
const dayjs = require("dayjs");
const { executeBatch } = require("../framework/batchExecutor");

/**
 * 이카운트 ERP "오늘" 재고 배치 (강제 수집)
 *
 * - 항상 오늘 기준일(YYYYMMDD)로 재고 조회
 * - DB upsert
 * - 운영에서 "매일 최신 기준값" 확보용
 */
exports.run = async () => {
  return executeBatch({
    jobName: "ECOUNT_ERP_TODAY_INVENTORY",
    runType: "TODAY_INVENTORY",

    /**
     * client : 트랜잭션 DB 커넥션
     * stat   : { totalCnt, successCnt, failCnt }
     */
    jobFn: async (client, stat) => {
      console.log(`▶ [JOB][ECOUNT][TODAY] 재고 수집 시작`);

      // =====================================================
      // 1️⃣ 기준일 결정 (오늘)
      // =====================================================
      const baseYmd = dayjs().format("YYYYMMDD");
      console.log(`▶ 재고 기준일(오늘): ${baseYmd}`);

      // =====================================================
      // 2️⃣ Ecount 로그인
      // =====================================================
      const basic = new EcountBasic();
      const zone = await basic.fetchZonePrefix();
      const baseUrl = `https://oapi${zone}.ecount.com`;
      const sessionId = await basic.performLogin(baseUrl, zone);

      if (!sessionId) {
        throw new Error("SESSION_ID 획득 실패");
      }

      // =====================================================
      // 3️⃣ 재고 API 호출
      // =====================================================
      let items = [];

      try {
        const res = await axios.post(
          `${baseUrl}/OAPI/V2/InventoryBalance/GetListInventoryBalanceStatus?SESSION_ID=${sessionId}`,
          {
            BASE_DATE: baseYmd,
            WHS_CD: "",
            PROD_CD: "",
          },
          { timeout: 60000 },
        );

        const parsed = basic.parseAndCheckResponse(res.data);
        items = parsed?.Data?.Result || [];
      } catch (err) {
        if (err.response) {
          console.error("❌ ECOUNT API ERROR");
          console.error("STATUS:", err.response.status);
          console.error("DATA:", JSON.stringify(err.response.data, null, 2));
        }
        throw err;
      }

      console.log(`▶ 수집 대상 재고 건수(오늘): ${items.length}`);

      // =====================================================
      // 4️⃣ 재고 UPSERT (stat 반영)
      // =====================================================
      for (const rawItem of items) {
        stat.totalCnt++;

        try {
          const item = camelcaseKeys(rawItem, { deep: true });

          const param = {
            baseYmd,
            prodCd: item.prodCd,
            whloQty: parseInt(item.balQty || "0", 10),
          };

          await repo.upsertInventory(param, "BATCH_SYSTEM", client);

          stat.successCnt++;
        } catch (err) {
          stat.failCnt++;

          console.error(
            `[JOB][ECOUNT][TODAY][FAIL] prodCd=${rawItem?.PROD_CD}`,
            err.message,
          );
        }
      }

      console.log(
        `[JOB][ECOUNT][TODAY] 완료 total=${stat.totalCnt}, success=${stat.successCnt}, fail=${stat.failCnt}`,
      );
    },
  });
};
