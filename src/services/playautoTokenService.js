const config = require("../config");
const { createPlayautoClient } = require("./playautoHttpClient");

const API_NAME = "PLAYAUTO";
const LOCK_KEY = 777001;
const ACTOR = "BATCH";

function resolveTokenPath() {
  const raw = (config.playauto.tokenUrl || "").trim();

  if (!raw) {
    return "/api/auth";
  }

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const parsed = new URL(raw);
      return parsed.pathname || "/api/auth";
    } catch (_) {
      return "/api/auth";
    }
  }

  if (raw === "/auth" || raw === "auth") {
    return "/api/auth";
  }

  return raw.startsWith("/") ? raw : `/${raw}`;
}

async function issueToken() {
  try {
    const response = await client.post("/api/auth", {
      email: process.env.PLAYAUTO_EMAIL,
      password: process.env.PLAYAUTO_PASSWORD,
    });

    const payload = Array.isArray(response.data)
      ? response.data[0]
      : response.data;

    if (!payload?.token) {
      throw new Error("PLAYAUTO token missing");
    }

    return payload;
  } catch (err) {
    console.error("[PLAYAUTO][AUTH] FAILED", {
      status: err.response?.status,
      statusText: err.response?.statusText,
      data: err.response?.data,
      baseURL: client.defaults.baseURL,
      url: "/api/auth",
      hasApiKey: Boolean(process.env.PLAYAUTO_API_KEY),
      email: process.env.PLAYAUTO_EMAIL,
    });
    throw err;
  }
}

async function getActiveToken(client) {
  const { rows } = await client.query(
    `
    SELECT acs_tkn,
           sol_no,
           expr_dt
      FROM api_tkn_mst
     WHERE api_nm = $1
       AND use_yn = 'Y'
       AND del_yn = 'N'
     ORDER BY reg_dt DESC
     LIMIT 1
    `,
    [API_NAME],
  );

  return rows[0] || null;
}

async function saveToken(client, tokenData) {
  const { token, solNo, expireDt } = tokenData;

  await client.query(
    `
    UPDATE api_tkn_mst
       SET use_yn   = 'N',
           mdfcn_dt = CURRENT_TIMESTAMP,
           mdfr_id  = $2
     WHERE api_nm = $1
       AND use_yn = 'Y'
       AND del_yn = 'N'
    `,
    [API_NAME, ACTOR],
  );

  await client.query(
    `
    INSERT INTO api_tkn_mst (
        api_tkn_id,
        api_nm,
        acs_tkn,
        sol_no,
        expr_dt,
        reg_dt,
        rgtr_id,
        del_yn,
        use_yn
    )
    VALUES (
        (SELECT fn_create_pk('API_TKN_MST')),
        $1,
        $2,
        $3,
        $4,
        CURRENT_TIMESTAMP,
        $5,
        'N',
        'Y'
    )
    `,
    [API_NAME, token, solNo, expireDt, ACTOR],
  );

  return {
    accessToken: token,
    token,
    solNo,
  };
}

async function refreshToken(client) {
  const lockRes = await client.query(
    "SELECT pg_try_advisory_lock($1) as locked",
    [LOCK_KEY],
  );

  if (lockRes.rows?.[0]?.locked) {
    try {
      const newToken = await issueToken();
      const saved = await saveToken(client, newToken);
      return saved.accessToken;
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
    }
  }

  const active = await getActiveToken(client);
  if (!active?.acs_tkn) {
    throw new Error("PlayAuto 토큰 재조회 실패");
  }

  return active.acs_tkn;
}

async function getPlayautoAuth(client) {
  let active = await getActiveToken(client);

  if (!active) {
    const newToken = await issueToken();
    return await saveToken(client, newToken);
  }

  const now = new Date();
  const expireAt = new Date(active.expr_dt);

  if (expireAt - now < 5 * 60 * 1000) {
    const refreshedToken = await refreshToken(client);
    active = await getActiveToken(client);

    return {
      accessToken: refreshedToken,
      token: refreshedToken,
      solNo: active?.sol_no,
    };
  }

  return {
    accessToken: active.acs_tkn,
    token: active.acs_tkn,
    solNo: active.sol_no,
  };
}

module.exports = {
  getPlayautoAuth,
  refreshToken,
  issueToken,
};
