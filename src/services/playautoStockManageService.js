const config = require("../config");
const { createPlayautoClient } = require("./playautoHttpClient");
const { getPlayautoAuth, refreshToken } = require("./playautoTokenService");

/**
 * PlayAuto 실재고 가감 적용 (입고/출고)
 * PUT /api/stock/manage/v1.1
 *
 * @param {object} param
 * @param {string} param.skuCd
 * @param {number} param.dptNo
 * @param {"입고"|"출고"} param.type
 * @param {number} param.count (양수)
 */
async function applyPlayautoRealStockDelta(
  client,
  { skuCd, dptNo, type, count },
) {
  if (!skuCd) throw new Error("skuCd is required");
  if (dptNo === null || dptNo === undefined)
    throw new Error("dptNo is required");
  if (!count || Number(count) <= 0) throw new Error("count must be > 0");
  if (type !== "입고" && type !== "출고")
    throw new Error("type must be '입고' or '출고'");

  let { token } = await getPlayautoAuth(client);

  try {
    return await requestManage(token, { skuCd, dptNo, type, count });
  } catch (err) {
    if (err?.response?.status === 401) {
      token = await refreshToken(client);
      return await requestManage(token, { skuCd, dptNo, type, count });
    }
    throw err;
  }
}

async function requestManage(token, { skuCd, dptNo, type, count }) {
  const http = createPlayautoClient(token);

  const payload = {
    stocks: [{ sku_cd: skuCd, depot_no: Number(dptNo) }],
    set: "실재고",
    type,
    count: Number(count),
  };

  const res = await http.put(config.playauto.stockManageUrl, payload);

  if (!res?.data) throw new Error("PlayAuto 재고수정 API 응답 오류");
  return res.data;
}

module.exports = { applyPlayautoRealStockDelta };
