const axios = require("axios");
const config = require("../config");

/**
 * 🔥 PlayAuto 공통 axios 인스턴스 생성
 * @param {string|null} token
 */
function createPlayautoClient(token = null) {
  if (!config.playauto.baseUrl) {
    throw new Error("config.playauto.baseUrl (PLAYAUTO_BASE_URL) is required");
  }

  const headers = {
    "x-api-key": config.playauto.apiKey,
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Token ${token}`;
  }

  return axios.create({
    baseURL: config.playauto.baseUrl, // ✅ 핵심
    timeout: config.playauto.timeout,
    headers,
  });
}

module.exports = { createPlayautoClient };
