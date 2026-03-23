const config = require("../config");
const { createPlayautoClient } = require("./playautoHttpClient");
const { getPlayautoAuth, refreshToken } = require("./playautoTokenService");

function isAuthErrorResponse(data) {
  return data?.error_code === 401;
}

/**
 * PlayAuto SKU 리스트 조회 (/api/stock/list/v1.2)
 * - 기본 90일 제한이 있으므로 최초 전체 동기화는 sdate를 아주 과거로 넣는 것을 권장
 */
async function fetchPlayautoSkuList(client, body = {}) {
  let { accessToken } = await getPlayautoAuth(client);

  try {
    return await requestSkuList(accessToken, body);
  } catch (err) {
    if (
      err?.response?.status === 401 ||
      isAuthErrorResponse(err?.response?.data)
    ) {
      accessToken = await refreshToken(client);
      return await requestSkuList(accessToken, body);
    }
    throw err;
  }
}

async function requestSkuList(accessToken, body = {}) {
  if (!accessToken) {
    throw new Error("PlayAuto accessToken 누락");
  }

  const http = createPlayautoClient(accessToken);
  const payload = {
    start: body.start ?? 0,
    limit: body.limit ?? 100,
    search_key: body.search_key ?? "all",
    search_word: body.search_word ?? [],
    search_type: body.search_type ?? "partial",
    date_type: body.date_type ?? "wdate",
    sdate: body.sdate ?? "2000-01-01",
    edate: body.edate,
  };

  const res = await http.post(config.playauto.stockListUrl, payload);

  if (isAuthErrorResponse(res?.data)) {
    const error = new Error("PlayAuto SKU LIST API 인증 오류");
    error.response = {
      status: 401,
      data: res.data,
    };
    throw error;
  }

  if (!res.data || !Array.isArray(res.data.results)) {
    throw new Error("PlayAuto SKU LIST API 응답 오류");
  }

  return res.data;
}

module.exports = { fetchPlayautoSkuList };
