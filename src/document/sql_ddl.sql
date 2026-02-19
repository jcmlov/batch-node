-- ======================================================
-- 테이블명 : batch_job_exec
-- 설명     : 배치(Job) 실행 이력 관리 테이블
--            각 배치 실행 단위를 1 Row로 기록하여
--            실행 상태, 처리 건수, 오류 원인 추적을 목적으로 한다.
-- ======================================================
CREATE TABLE batch_job_exec (
  exec_id      BIGSERIAL PRIMARY KEY,
  -- 배치 실행 이력 고유 식별자 (PK)
  job_name     VARCHAR(100) NOT NULL,
  -- 배치 Job 식별자
  -- 예) SHOPPING_RANK, ECOUNT_ERP_PRODUCT, ECOUNT_ERP_INVENTORY
  run_type     VARCHAR(30),
  -- 배치 실행 유형
  -- CRON      : 스케줄러에 의해 자동 실행
  -- MANUAL    : API 또는 관리자 수동 실행
  -- YESTERDAY : 전일 기준 강제 실행 등 특수 실행
  base_ymd     VARCHAR(8),
  -- 배치 기준일 (YYYYMMDD)
  -- 재고, 정산 등 날짜 기준 배치에서 사용
  -- 기준일이 없는 배치는 NULL 가능
  status       VARCHAR(20),
  -- 배치 실행 상태
  -- RUNNING : 실행 중
  -- SUCCESS : 정상 완료
  -- PARTIAL : 일부 실패
  -- FAIL    : 전체 실패
  total_cnt    INT DEFAULT 0,
  -- 전체 처리 대상 건수
  success_cnt  INT DEFAULT 0,
  -- 정상 처리 성공 건수
  fail_cnt     INT DEFAULT 0,
  -- 처리 실패 건수
  start_dt     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- 배치 실행 시작 시각
  end_dt       TIMESTAMP,
  -- 배치 실행 종료 시각
  error_msg    TEXT
  -- 배치 실패 또는 예외 발생 시 오류 메시지
);

-- ======================================================
-- 인덱스명 : idx_batch_job_exec_01
-- 설명     : 배치 Job별 / 기준일별 실행 이력 조회 성능 개선
-- ======================================================
CREATE INDEX idx_batch_job_exec_01
ON batch_job_exec (job_name, base_ymd);

-- ======================================================
-- TABLE COMMENT
-- ======================================================
COMMENT ON TABLE batch_job_exec IS
'배치(Job) 실행 이력 관리 테이블.
각 배치 실행 단위를 1건으로 기록하며, 실행 유형, 기준일, 처리 건수, 상태 및 오류 정보를 관리한다.';

-- ======================================================
-- COLUMN COMMENTS
-- ======================================================
COMMENT ON COLUMN batch_job_exec.exec_id IS
'배치 실행 이력 고유 식별자 (PK, 자동 증가)';
COMMENT ON COLUMN batch_job_exec.job_name IS
'배치 Job 식별자 (예: SHOPPING_RANK, ECOUNT_ERP_PRODUCT, ECOUNT_ERP_INVENTORY)';
COMMENT ON COLUMN batch_job_exec.run_type IS
'배치 실행 유형 (CRON: 스케줄 실행, MANUAL: 수동 실행, YESTERDAY: 전일 기준 실행 등)';
COMMENT ON COLUMN batch_job_exec.base_ymd IS
'배치 기준일 (YYYYMMDD 형식, 날짜 기준 배치에서 사용)';
COMMENT ON COLUMN batch_job_exec.status IS
'배치 실행 상태 (RUNNING / SUCCESS / PARTIAL / FAIL)';
COMMENT ON COLUMN batch_job_exec.total_cnt IS
'전체 처리 대상 건수';
COMMENT ON COLUMN batch_job_exec.success_cnt IS
'정상 처리 성공 건수';
COMMENT ON COLUMN batch_job_exec.fail_cnt IS
'처리 실패 건수';
COMMENT ON COLUMN batch_job_exec.start_dt IS
'배치 실행 시작 일시';
COMMENT ON COLUMN batch_job_exec.end_dt IS
'배치 실행 종료 일시';
COMMENT ON COLUMN batch_job_exec.error_msg IS
'배치 실행 중 발생한 오류 메시지 또는 실패 사유';

-- ======================================================
-- INDEX COMMENT
-- ======================================================
COMMENT ON INDEX idx_batch_job_exec_01 IS
'배치 Job명 + 기준일(base_ymd) 기준 실행 이력 조회 성능 향상을 위한 인덱스';
