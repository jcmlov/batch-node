const repo = require("../../repository/ecountErpInventory.repository");
const EcountBasic = require("../ecount/ecount.basic");
const axios = require("axios");
const camelcaseKeys = require("camelcase-keys");
const dayjs = require("dayjs");
const { executeBatch } = require("../framework/batchExecutor");

/**
 * 이카운트 ERP 재고 배치
 *
 * type:
 *  - INVENTORY           : 누락 기준일 보정
 *  - YESTERDAY_INVENTORY : 전일 재고 강제 수집
 */
exports.run = async (type = "INVENTORY") => {
  return executeBatch({
    jobName: "ECOUNT_ERP_INVENTORY",
    runType: type,

    /**
     * client : 트랜잭션 DB 커넥션
     * stat   : { totalCnt, successCnt, failCnt }
     */
    jobFn: async (client, stat) => {
      console.log(`▶ [JOB][ECOUNT][${type}] 재고 수집 시작`);

      // =====================================================
      // 1️⃣ 기준일 결정
      // =====================================================
      let baseYmd;

      if (type === "YESTERDAY_INVENTORY") {
        baseYmd = dayjs().subtract(1, "day").format("YYYYMMDD");
      } else {
        baseYmd = await repo.selectMissingInventoryDate(client);
      }

      if (!baseYmd) {
        console.log("▶ 재고 수집 대상 기준일 없음 (SKIP)");
        return;
      }

      console.log(`▶ 재고 기준일: ${baseYmd}`);

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

      console.log(`▶ 수집 대상 재고 건수: ${items.length}`);

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
            `[JOB][ECOUNT][INVENTORY][FAIL] prodCd=${rawItem?.PROD_CD}`,
            err.message,
          );
        }
      }

      console.log(
        `[JOB][ECOUNT][INVENTORY] 완료 total=${stat.totalCnt}, success=${stat.successCnt}, fail=${stat.failCnt}`,
      );
    },
  });
};
