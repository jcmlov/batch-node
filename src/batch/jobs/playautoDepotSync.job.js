const { executeBatch } = require("../framework/batchExecutor");
const { fetchPlayautoDepots } = require("../../services/playautoDepotService");
const { getPlayautoAuth } = require("../../services/playautoTokenService");

function boolToYN(val) {
  return val ? "Y" : "N";
}

/**
 * PlayAuto 배송처 동기화 배치 (executeBatch 적용)
 * - dpt_mst upsert
 * - API에 없는 배송처는 sol_no 범위 내에서 소프트삭제
 *
 * 전제:
 * - dpt_mst: UNIQUE(sol_no, dpt_no) or PK/UK 존재 (ON CONFLICT에 필요)
 * - fn_create_pk('DPT_MST') 사용 가능
 */
exports.run = async (type = "PLAYAUTO_DPT_SYNC") => {
  return executeBatch({
    jobName: "PLAYAUTO_DPT_SYNC",
    runType: type,

    /**
     * client : 트랜잭션 DB 커넥션
     * stat   : { totalCnt, successCnt, failCnt }
     */
    jobFn: async (client, stat) => {
      const LOCK_KEY = 888001;
      const ACTOR = "BATCH";

      // 🔐 동시 실행 방지
      const lockRes = await client.query(
        "SELECT pg_try_advisory_lock($1) as locked",
        [LOCK_KEY],
      );

      if (!lockRes.rows?.[0]?.locked) {
        console.log("▶ [JOB][PLAYAUTO][DPT] 이미 실행중 (SKIP)");
        return stat;
      }

      try {
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
          stat.totalCnt++;

          const savepointName = `sp_playauto_dpt_${stat.totalCnt}`;

          try {
            await client.query(`SAVEPOINT ${savepointName}`);

            const dptNo = Number(item.no); // API 배송처번호
            if (!Number.isFinite(dptNo)) {
              throw new Error(`배송처번호(no) 형식 오류: ${item?.no}`);
            }

            apiDptNos.push(dptNo);

            const params = [
              solNo,
              dptNo,
              boolToYN(item.default_yn),
              item.name,
              item.address,
              item.zip,
              item.charge_name,
              ACTOR,
            ];

            const updateRes = await client.query(
              `
              UPDATE dpt_mst
                 SET dflt_yn  = $3,
                     dpt_nm   = $4,
                     addr     = $5,
                     zip_no   = $6,
                     pic_nm   = $7,
                     use_yn   = 'Y',
                     del_yn   = 'N',
                     mdfcn_dt = CURRENT_TIMESTAMP,
                     mdfr_id  = $8
               WHERE sol_no = $1
                 AND dpt_no = $2
              `,
              params,
            );

            if (updateRes.rowCount === 0) {
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
                SELECT
                    (SELECT fn_create_pk('DPT_MST')),
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    $7,
                    CURRENT_TIMESTAMP,
                    $8,
                    'N',
                    'Y'
                WHERE NOT EXISTS (
                    SELECT 1
                      FROM dpt_mst
                     WHERE sol_no = $1
                       AND dpt_no = $2
                )
                `,
                params,
              );

              await client.query(
                `
                UPDATE dpt_mst
                   SET dflt_yn  = $3,
                       dpt_nm   = $4,
                       addr     = $5,
                       zip_no   = $6,
                       pic_nm   = $7,
                       use_yn   = 'Y',
                       del_yn   = 'N',
                       mdfcn_dt = CURRENT_TIMESTAMP,
                       mdfr_id  = $8
                 WHERE sol_no = $1
                   AND dpt_no = $2
                `,
                params,
              );
            }

            await client.query(`RELEASE SAVEPOINT ${savepointName}`);
            stat.successCnt++;
          } catch (e) {
            try {
              await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
              await client.query(`RELEASE SAVEPOINT ${savepointName}`);
            } catch (rollbackErr) {
              console.error(
                `[JOB][PLAYAUTO][DPT][ROLLBACK_FAIL] dpt_no=${item?.no}`,
                rollbackErr.message,
              );
            }

            stat.failCnt++;
            console.error(
              `[JOB][PLAYAUTO][DPT][FAIL] dpt_no=${item?.no}`,
              e.message,
            );
          }
        }

        // 🔥 소프트 삭제 (SOL_NO 범위 내 + API에 없는 dpt_no)
        // - apiDptNos가 비어있는 경우 ALL() 쿼리 에러날 수 있으니 방어
        if (apiDptNos.length > 0) {
          await client.query(
            `
            UPDATE dpt_mst
               SET del_yn   = 'Y',
                   use_yn   = 'N',
                   mdfcn_dt = CURRENT_TIMESTAMP,
                   mdfr_id  = $3
             WHERE sol_no = $2
               AND dpt_no IS NOT NULL
               AND dpt_no <> ALL($1::numeric[])
            `,
            [apiDptNos, solNo, ACTOR],
          );
        }

        console.log(
          `▶ [JOB][PLAYAUTO][DPT] 완료 total=${stat.totalCnt}, success=${stat.successCnt}, fail=${stat.failCnt}`,
        );

        return stat;
      } finally {
        // 🔓 lock 해제
        try {
          await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
        } catch (e) {
          console.error("advisory unlock 실패:", e);
        }
      }
    },
  });
};
