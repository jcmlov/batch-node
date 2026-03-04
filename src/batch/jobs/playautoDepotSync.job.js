const pool = require("../../db/pool");
const { fetchPlayautoDepots } = require("../../services/playautoDepotService");
const { getPlayautoAuth } = require("../../services/playautoTokenService");

function boolToYN(val) {
  return val ? "Y" : "N";
}

async function playautoDepotSyncJob() {
  const client = await pool.connect();
  const LOCK_KEY = 888001;

  try {
    // 🔐 동시 실행 방지
    const lockRes = await client.query(
      "SELECT pg_try_advisory_lock($1) as locked",
      [LOCK_KEY],
    );

    if (!lockRes.rows[0].locked) {
      console.log("이미 실행중");
      return;
    }

    await client.query("BEGIN");

    // 🔥 토큰 + sol_no 확보
    const { solNo } = await getPlayautoAuth(client);

    if (!solNo) {
      throw new Error("PlayAuto sol_no 확보 실패");
    }

    // 🔥 배송처 API 호출
    const apiList = await fetchPlayautoDepots(client);

    if (!apiList || apiList.length === 0) {
      throw new Error("PlayAuto 배송처 API 결과가 비어있습니다.");
    }

    const apiDptNos = [];

    for (const item of apiList) {
      const dptNo = Number(item.no); // 🔥 API 배송처번호
      apiDptNos.push(dptNo);

      await client.query(
        `
        INSERT INTO dpt_mst (
            dpt_id,
            sol_no,
            dpt_no,
            dflt_yn,
            dpt_nm,
            addr,
            zip_no,
            pic_nm,
            reg_dt,
            rgtr_id,
            del_yn,
            use_yn
        )
        VALUES (
            (SELECT fn_create_pk('DPT_MST')),
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            CURRENT_TIMESTAMP,
            'BATCH',
            'N',
            'Y'
        )
        ON CONFLICT (sol_no, dpt_no)
        DO UPDATE SET
            dflt_yn  = EXCLUDED.dflt_yn,
            dpt_nm   = EXCLUDED.dpt_nm,
            addr     = EXCLUDED.addr,
            zip_no   = EXCLUDED.zip_no,
            pic_nm   = EXCLUDED.pic_nm,
            use_yn   = 'Y',
            del_yn   = 'N',
            mdfcn_dt = CURRENT_TIMESTAMP,
            mdfr_id  = 'BATCH'
        `,
        [
          solNo,
          dptNo,
          boolToYN(item.default_yn),
          item.name,
          item.address,
          item.zip,
          item.charge_name,
        ],
      );
    }

    // 🔥 소프트 삭제 (SOL_NO 범위 내 + API에 없는 dpt_no)
    await client.query(
      `
      UPDATE dpt_mst
         SET del_yn   = 'Y',
             use_yn   = 'N',
             mdfcn_dt = CURRENT_TIMESTAMP,
             mdfr_id  = 'BATCH'
       WHERE sol_no = $2
         AND (
              dpt_no IS NOT NULL
              AND dpt_no <> ALL($1::numeric[])
         )
      `,
      [apiDptNos, solNo],
    );

    await client.query("COMMIT");

    console.log("PlayAuto 배송처 동기화 완료");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("PlayAuto 배송처 동기화 실패:", err);
    throw err;
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
    } catch (e) {
      console.error("advisory unlock 실패:", e);
    }
    client.release();
  }
}

module.exports = { playautoDepotSyncJob };
