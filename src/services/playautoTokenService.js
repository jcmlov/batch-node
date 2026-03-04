const config = require("../config");
const { createPlayautoClient } = require("./playautoHttpClient");

const API_NAME = "PLAYAUTO";
const LOCK_KEY = 777001;

/**
 * 🔥 PlayAuto 토큰 발급
 */
async function issueToken() {
  const http = createPlayautoClient();

  const response = await http.post(config.playauto.tokenUrl, {
    email: config.playauto.userId,
    password: config.playauto.password,
  });

  if (!response.data || !response.data[0]) {
    throw new Error("PlayAuto 토큰 발급 실패");
  }

  const { token, sol_no } = response.data[0];

  return {
    token,
    solNo: sol_no,
    expireDt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };
}

/**
 * 🔥 DB에서 현재 활성 토큰 조회
 */
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

/**
 * 🔥 토큰 저장 (기존 토큰 비활성화 포함)
 */
async function saveToken(client, tokenData) {
  const { token, solNo, expireDt } = tokenData;

  await client.query(
    `
    UPDATE api_tkn_mst
       SET use_yn   = 'N',
           mdfcn_dt = CURRENT_TIMESTAMP,
           mdfr_id  = 'BATCH'
     WHERE api_nm = $1
       AND use_yn = 'Y'
       AND del_yn = 'N'
    `,
    [API_NAME],
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
        'BATCH',
        'N',
        'Y'
    )
    `,
    [API_NAME, token, solNo, expireDt],
  );

  return {
    accessToken: token,
    solNo,
  };
}

/**
 * =========================================================
 * 🔥🔥🔥 통합 진입 함수
 * =========================================================
 */
async function getPlayautoAuth(client) {
  let active = await getActiveToken(client);

  // 1️⃣ 토큰 없으면 발급
  if (!active) {
    const newToken = await issueToken();
    return await saveToken(client, newToken);
  }

  const now = new Date();
  const expireAt = new Date(active.expr_dt);

  // 2️⃣ 만료 5분 전이면 갱신
  if (expireAt - now < 5 * 60 * 1000) {
    const lockRes = await client.query(
      "SELECT pg_try_advisory_lock($1) as locked",
      [LOCK_KEY],
    );

    if (lockRes.rows[0].locked) {
      try {
        const newToken = await issueToken();
        return await saveToken(client, newToken);
      } finally {
        await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
      }
    }

    // 다른 프로세스가 갱신 중이면 재조회
    active = await getActiveToken(client);
  }

  return {
    accessToken: active.acs_tkn,
    solNo: active.sol_no,
  };
}

module.exports = {
  getPlayautoAuth,
};
