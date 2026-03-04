const config = require("../config");
const { getPlayautoAuth } = require("./playautoTokenService");
const { createPlayautoClient } = require("./playautoHttpClient");

/**
 * 🔥 PlayAuto 배송처 조회
 */
async function fetchPlayautoDepots(client) {
  // 🔥 항상 유효한 토큰 + solNo 보장
  const { accessToken } = await getPlayautoAuth(client);

  try {
    return await requestDepots(accessToken);
  } catch (err) {
    if (err.response?.status === 401) {
      const { accessToken: newToken } = await getPlayautoAuth(client);
      return await requestDepots(newToken);
    }
    throw err;
  }
}

/**
 * 🔥 실제 API 호출
 */
async function requestDepots(accessToken) {
  const http = createPlayautoClient(accessToken);

  const response = await http.get(config.playauto.depotUrl, {
    params: {
      masking_yn: false,
    },
  });

  if (!Array.isArray(response.data)) {
    throw new Error("PlayAuto 배송처 API 응답 오류");
  }

  return response.data;
}

module.exports = {
  fetchPlayautoDepots,
};
