const config = require("../config");
const { createPlayautoClient } = require("./playautoHttpClient");
const { getPlayautoAuth, refreshToken } = require("./playautoTokenService");

/**
 * PlayAuto 재고현황조회(Stock Condition)
 * POST /api/stock/condition
 */
async function fetchPlayautoStockCondition(client, params = {}) {
  // 토큰 + sol_no 확보 (없으면 자동 발급/갱신)
  let { token } = await getPlayautoAuth(client);

  try {
    return await requestStockCondition(token, params);
  } catch (err) {
    // 401이면 토큰 갱신 후 1회 재시도
    if (err?.response?.status === 401) {
      token = await refreshToken(client);
      return await requestStockCondition(token, params);
    }
    throw err;
  }
}

async function requestStockCondition(token, params) {
  const http = createPlayautoClient(token);

  const payload = {
    start: params.start ?? 0,
    limit: params.limit ?? 100,
    orderbyColumn: params.orderbyColumn ?? "wdate",
    orderbyType: params.orderbyType ?? "DESC",
    search_key: params.search_key ?? "all",
    search_word: params.search_word ?? "",
    search_type: params.search_type ?? "partial",
    date_type: params.date_type ?? "wdate",
    sdate: params.sdate, // 미지정이면 PlayAuto 기본 90일
    edate: params.edate,
    supp_no: params.supp_no,
    depot_no: params.depot_no,
    state: params.state,
  };

  const res = await http.post(config.playauto.stockCondUrl, payload);

  if (!res?.data || !Array.isArray(res.data.results)) {
    throw new Error("PlayAuto 재고현황조회 API 응답 오류");
  }

  return res.data;
}

module.exports = { fetchPlayautoStockCondition };
