const axios = require("axios");
const config = require("../config");

function createPlayautoClient(token = null) {
  if (!config.playauto.baseUrl) {
    throw new Error("config.playauto.baseUrl (PLAYAUTO_BASE_URL) is required");
  }

  if (!config.playauto.apiKey) {
    throw new Error("config.playauto.apiKey (PLAYAUTO_API_KEY) is required");
  }

  const normalizedToken =
    typeof token === "string" && token.trim() ? token.trim() : null;

  const headers = {
    "Content-Type": "application/json; charset=UTF-8",
    "x-api-key": config.playauto.apiKey,
  };

  if (normalizedToken) {
    headers.Authorization = `Token ${normalizedToken}`;
  }

  return axios.create({
    baseURL: config.playauto.baseUrl,
    timeout: config.playauto.timeout,
    headers,
  });
}

module.exports = { createPlayautoClient };
