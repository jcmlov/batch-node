const config = require("../config");
const { createPlayautoClient } = require("./playautoHttpClient");

const API_NAME = "PLAYAUTO";
const LOCK_KEY = 777001;
const ACTOR = "BATCH";
const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const TOKEN_EXPIRE_MS = 24 * 60 * 60 * 1000;

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

function normalizeActiveToken(row) {
  if (!row) return null;

  const accessToken = typeof row.acs_tkn === "string" ? row.acs_tkn.trim() : "";
  const solNo = row.sol_no ?? null;
  const expireDt = row.expr_dt ? new Date(row.expr_dt) : null;
  const hasValidExpireDt = expireDt && !Number.isNaN(expireDt.getTime());

  return {
    accessToken: accessToken || null,
    token: accessToken || null,
    solNo,
    expireDt: hasValidExpireDt ? expireDt : null,
  };
}

async function issueToken() {
  const httpClient = createPlayautoClient();
  const tokenPath = resolveTokenPath();

  const response = await httpClient.post(tokenPath, {
    email: config.playauto.userId,
    password: config.playauto.password,
  });

  const payload = Array.isArray(response.data)
    ? response.data[0]
    : response.data;

  if (!payload?.token) {
    throw new Error("PlayAuto 토큰 발급 실패");
  }

  return {
    token: payload.token,
    solNo: payload.sol_no,
    expireDt: new Date(Date.now() + TOKEN_EXPIRE_MS),
  };
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

  if (!token) {
    throw new Error("PlayAuto 저장 대상 토큰 누락");
  }

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
    expireDt,
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

  const active = normalizeActiveToken(await getActiveToken(client));
  if (!active?.accessToken) {
    throw new Error("PlayAuto 토큰 재조회 실패");
  }

  return active.accessToken;
}

async function getPlayautoAuth(client) {
  let active = normalizeActiveToken(await getActiveToken(client));

  if (!active?.accessToken) {
    const newToken = await issueToken();
    return await saveToken(client, newToken);
  }

  const now = Date.now();
  const expireAt = active.expireDt?.getTime?.() || 0;

  if (!expireAt || expireAt - now < REFRESH_BUFFER_MS) {
    const refreshedToken = await refreshToken(client);
    active = normalizeActiveToken(await getActiveToken(client));

    return {
      accessToken: refreshedToken,
      token: refreshedToken,
      solNo: active?.solNo,
      expireDt: active?.expireDt || null,
    };
  }

  return active;
}

module.exports = {
  getPlayautoAuth,
  refreshToken,
  issueToken,
};
