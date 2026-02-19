const axios = require("axios");
const sleep = require("../../utils/sleep");
const repo = require("../../repository/rank.repository");
const config = require("../../config");

module.exports = async (target, batchType) => {
  console.log(
    `[STEP][${batchType}] keyword=${target.srchKwdNm}, store=${target.storNm}`,
  );

  let rank = 0;

  for (let page = 0; page < 10; page++) {
    const start = page * 100 + 1;

    const res = await axios.get(
      "https://openapi.naver.com/v1/search/shop.json",
      {
        headers: {
          "X-Naver-Client-Id": config.naver.clientId,
          "X-Naver-Client-Secret": config.naver.clientSecret,
        },
        params: {
          query: target.srchKwdNm,
          display: 100,
          start,
        },
      },
    );

    if (!res.data?.items?.length) break;

    for (const item of res.data.items) {
      rank++;

      if (item.mallName === target.storNm) {
        await repo.insertRankHistory({
          srchKwdId: target.srchKwdId,
          nvrPrdId: item.productId,
          prdNm: item.title,
          expRankNo: rank,
          srchCnt: rank,
          rgtrId: `BATCH_${batchType}`,
        });
      }
    }

    await sleep(3000);
  }

  await sleep(10000);
};
