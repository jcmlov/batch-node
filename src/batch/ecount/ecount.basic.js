const axios = require("axios");
const config = require("../../config");

class EcountErpBasicService {
  constructor() {
    this.baseClient = axios.create({
      timeout: 60000,
      headers: { "Content-Type": "application/json" },
    });
  }

  async fetchZonePrefix() {
    const res = await this.baseClient.post(
      "https://oapi.ecount.com/OAPI/V2/Zone",
      {
        COM_CODE: config.ecount.companyId,
        USER_ID: config.ecount.userId,
      },
    );
    return res.data?.Data?.ZONE;
  }

  async performLogin(baseUrl, zonePrefix) {
    const res = await this.baseClient.post(
      `${baseUrl}/OAPI/V2/OAPILogin`,
      {
        COM_CODE: config.ecount.companyId,
        USER_ID: config.ecount.userId,
        API_CERT_KEY: config.ecount.apiCertKey,
        LAN_TYPE: "ko-KR",
        ZONE: zonePrefix,
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 10000,
      },
    );

    const parsed = this.parseAndCheckResponse(res.data);

    const sessionId = parsed?.Data?.Datas?.SESSION_ID;
    if (!sessionId) {
      console.error("[ECOUNT LOGIN RAW]", parsed);
      throw new Error("SESSION_ID 획득 실패");
    }

    return sessionId;
  }

  parseAndCheckResponse(rawResponse) {
    if (
      !rawResponse ||
      (typeof rawResponse === "string" && rawResponse.trim() === "")
    ) {
      throw new Error("API 응답이 비어있습니다.");
    }

    const res =
      typeof rawResponse === "string" ? JSON.parse(rawResponse) : rawResponse;

    const statusObj = res.Status;

    // 1️⃣ Status가 객체(Map)로 오는 경우 (로그인 / 품목조회 등)
    if (
      statusObj &&
      typeof statusObj === "object" &&
      !Array.isArray(statusObj)
    ) {
      const code = statusObj.Code;
      if (code !== "OK") {
        throw new Error(
          "API Business Error: " + (statusObj.Message || "UNKNOWN"),
        );
      }
    }
    // 2️⃣ Status가 숫자 or 문자열로 오는 경우 (Zone API 등)
    else if (typeof statusObj === "number" || typeof statusObj === "string") {
      const statusStr = String(statusObj);
      if (statusStr !== "200") {
        throw new Error("API HTTP Status Error: " + statusStr);
      }
    }
    // 3️⃣ Status 자체가 없는 이상 케이스
    else {
      throw new Error("API Status 형식이 올바르지 않습니다.");
    }

    return res;
  }
}

module.exports = EcountErpBasicService;
