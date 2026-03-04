const config = require("../config");
const { createPlayautoClient } = require("./playautoHttpClient");
const { getPlayautoAuth } = require("./playautoTokenService");

/**
 * PlayAuto SKU 리스트 조회 (/api/stock/list/v1.2)
 * - 기본 90일 제한이 있으므로 최초 전체 동기화는 sdate를 아주 과거로 넣는 것을 권장
 */
async function fetchPlayautoSkuList(client, body = {}) {
  const { accessToken } = await getPlayautoAuth(client);
  const http = createPlayautoClient(accessToken);

  const payload = {
    start: body.start ?? 0,
    limit: body.limit ?? 100,
    search_key: body.search_key ?? "all",
    search_word: body.search_word ?? [],
    search_type: body.search_type ?? "partial",
    date_type: body.date_type ?? "wdate",
    // ⚠️ 90일 기본 제한 방지(전체 동기화 목적)
    sdate: body.sdate ?? "2000-01-01",
    edate: body.edate,
  };

  const res = await http.post(config.playauto.stockListUrl, payload);

  if (!res.data || !Array.isArray(res.data.results)) {
    throw new Error("PlayAuto SKU LIST API 응답 오류");
  }

  return res.data; // { results:[], total:n }
}

module.exports = { fetchPlayautoSkuList };
