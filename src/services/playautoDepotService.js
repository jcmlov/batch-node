const config = require("../config");
const { getPlayautoAuth, refreshToken } = require("./playautoTokenService");
const { createPlayautoClient } = require("./playautoHttpClient");

function isAuthErrorResponse(data) {
  return data?.error_code === 401;
}

/**
 * PlayAuto 배송처 조회
 */
async function fetchPlayautoDepots(client) {
  let { accessToken } = await getPlayautoAuth(client);

  try {
    return await requestDepots(accessToken);
  } catch (err) {
    if (
      err?.response?.status === 401 ||
      isAuthErrorResponse(err?.response?.data)
    ) {
      accessToken = await refreshToken(client);
      return await requestDepots(accessToken);
    }
    throw err;
  }
}

/**
 * 실제 API 호출
 */
async function requestDepots(accessToken) {
  if (!accessToken) {
    throw new Error("PlayAuto accessToken 누락");
  }

  const http = createPlayautoClient(accessToken);
  const response = await http.get(config.playauto.depotUrl, {
    params: {
      masking_yn: false,
    },
  });

  if (isAuthErrorResponse(response?.data)) {
    const error = new Error("PlayAuto 배송처 API 인증 오류");
    error.response = {
      status: 401,
      data: response.data,
    };
    throw error;
  }

  if (!Array.isArray(response.data)) {
    throw new Error("PlayAuto 배송처 API 응답 오류");
  }

  return response.data;
}

module.exports = {
  fetchPlayautoDepots,
};
