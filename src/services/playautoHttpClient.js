const axios = require("axios");
const config = require("../config");

function createPlayautoClient(token = null) {
  if (!config.playauto.baseUrl) {
    throw new Error("config.playauto.baseUrl (PLAYAUTO_BASE_URL) is required");
  }

  const headers = {
    "x-api-key": config.playauto.apiKey,
    "Content-Type": "application/json; charset=UTF-8",
  };

  if (token) {
    headers.Authorization = `Token ${token}`;
  }

  return axios.create({
    baseURL: config.playauto.baseUrl,
    timeout: config.playauto.timeout,
    headers,
  });
}

module.exports = { createPlayautoClient };
