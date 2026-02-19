const repo = require("../../repository/ecountErpProduct.repository");
const EcountBasic = require("../ecount/ecount.basic");
const axios = require("axios");
const camelcaseKeys = require("camelcase-keys");
const { executeBatch } = require("../framework/batchExecutor");

/**
 * 이카운트 ERP 상품 마스터 수집 배치
 */
exports.run = async (type = "BATCH_SYSTEM") => {
  return executeBatch({
    jobName: "ECOUNT_ERP_PRODUCT",
    runType: type,

    jobFn: async (client, stat) => {
      const basic = new EcountBasic();

      console.log("▶ [BATCH][PRODUCT] 이카운트 ERP 상품 수집 시작");

      // =====================================================
      // 1️⃣ 로그인
      // =====================================================
      const zone = await basic.fetchZonePrefix();
      const baseUrl = `https://oapi${zone}.ecount.com`;
      const sessionId = await basic.performLogin(baseUrl, zone);

      if (!sessionId) throw new Error("SESSION_ID 획득 실패");

      // =====================================================
      // 2️⃣ 상품 API 호출
      // =====================================================
      const res = await axios.post(
        `${baseUrl}/OAPI/V2/InventoryBasic/GetBasicProductsList?SESSION_ID=${sessionId}`,
        {
          IsHeader: "N",
          CheckDataPermission: "N",
          PROD_CD: "",
        },
        { timeout: 60000 },
      );

      const parsed = basic.parseAndCheckResponse(res.data);
      const items = parsed?.Data?.Result || [];

      // 👉 전체 대상 건수
      stat.totalCnt = items.length;

      // =====================================================
      // 3️⃣ 상품 UPSERT
      // =====================================================
      for (const rawItem of items) {
        try {
          if (!rawItem.PROD_DES) {
            stat.failCnt++;
            continue;
          }

          const item = camelcaseKeys(rawItem, { deep: true });

          const param = {
            ...item,
            prodNm: item.prodDes,
            balFlag: item.balFlag === "0" ? "N" : "Y",
            rePchPrc: parseInt(parseFloat(item.inPrice || "0"), 10) || 0,
          };

          await repo.upsertProduct(param, type, client);

          stat.successCnt++;
        } catch (err) {
          stat.failCnt++;
          console.error(
            "[ECOUNT_ERP_PRODUCT][ITEM_FAIL]",
            rawItem.PROD_CD,
            err.message,
          );
        }
      }

      console.log(
        `▶ [BATCH][PRODUCT] 성공 ${stat.successCnt}, 실패 ${stat.failCnt}`,
      );
    },
  });
};
