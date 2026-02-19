<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>VILIV Batch Node</title>
</head>
<body>

<h1>VILIV Batch Node</h1>

<p>
  <strong>VILIV Batch Node</strong>는 Node.js 기반의 배치 서버로,
  쇼핑 랭크 수집 및 ERP(Ecount) 연동 배치를 수행하며
  <code>pkg</code>를 이용해 실행 파일(<code>.exe</code>) 형태로 배포됩니다.
</p>

<hr />

<h2>1. 프로젝트 초기화</h2>

<pre><code>mkdir viliv-batch-node
cd viliv-batch-node
npm init -y
</code></pre>

<hr />

<h2>2. 패키지 설치</h2>

<h3>2-1. 런타임 의존성</h3>
<pre><code>npm install pg axios camelcase-keys node-cron express dotenv
npm install dayjs
</code></pre>

<h3>2-2. 빌드 및 개발 도구</h3>
<pre><code>npm install -D pkg
npm install cross-env --save-dev
</code></pre>

<h3>2-3. camelcase-keys 버전 고정</h3>
<pre><code>npm uninstall camelcase-keys
npm install camelcase-keys@5
</code></pre>

<hr />

<h2>3. 디렉토리 구조</h2>

<pre><code>viliv-batch-node/
├─ src/
│  ├─ config/
│  ├─ db/
│  ├─ repository/
│  ├─ batch/
│  │  ├─ jobs/
│  │  └─ steps/
│  ├─ scheduler/
│  ├─ utils/
│  ├─ app.js
│  └─ batch-runner.js
├─ .env.local
├─ package.json
└─ README.md
</code></pre>

<hr />

<h2>4. 파일 생성</h2>

<pre><code>mkdir -p src/{config,db,repository,batch/jobs,batch/steps,scheduler,utils}
touch .env.local

touch src/app.js
touch src/batch-runner.js

touch src/config/{index.js,local.js,dev.js,stg.js,prod.js}

touch src/db/pool.js
touch src/repository/rank.repository.js

touch src/batch/jobs/shoppingRank.job.js
touch src/batch/steps/collectNaverRank.step.js

touch src/scheduler/shoppingRank.cron.js
touch src/utils/sleep.js
</code></pre>

<hr />

<h2>5. 환경 변수 (.env.local)</h2>

<div class="box">
  <p>로컬 실행 시 <code>.env.local</code> 파일을 사용합니다.</p>
</div>

<pre><code>NODE_ENV=local
PORT=8082

DB_HOST=localhost
DB_PORT=5432
DB_NAME=viliverp
DB_USER=viliverp_dev
DB_PASSWORD=******

BATCH_ENABLED=true
</code></pre>

<hr />

<h2>6. 배치 실행 방식</h2>

<h3>6-1. HTTP 수동 실행</h3>

<pre><code>curl -X POST http://localhost:8082/batch/run
curl -X POST "http://localhost:8082/batch/run?type=MANUAL"

curl -X POST http://localhost:8082/api/ecount/product/batch/run

curl -X POST http://localhost:8082/api/ecount/inventory/batch/run \
  -H "Content-Type: application/json" \
  -d '{"type":"MANUAL"}'
curl -X POST http://localhost:8082/api/ecount/inventory/batch/run \
  -H "Content-Type: application/json" \
  -d '{"type":"YESTERDAY_INVENTORY"}'
</code></pre>

<p>PowerShell:</p>

<pre><code>Invoke-RestMethod -Method POST -Uri "http://localhost:8082/batch/run?type=MANUAL"
</code></pre>

<h3>6-2. 로컬 실행</h3>

<pre><code>npm run start:local
</code></pre>

<hr />

<h2>7. 실행 파일 빌드 (Windows)</h2>

<pre><code>npm run build:win
</code></pre>

<p>빌드 결과:</p>

<pre><code>viliv-batch-node/
├─ viliv-batch-node.exe
├─ .env.prod
└─ logs/   (선택)
</code></pre>

<hr />

<h2>8. 운영 실행 배치(run-prod.bat)</h2>

<pre><code>@echo off
title VILIV-BATCH-NODE Production Server
chcp 65001 > nul

echo ==========================================
echo [VILIV-BATCH-NODE] 운영 환경(PROD) 서비스를 시작합니다.
echo ==========================================
echo.

set NODE_ENV=prod

if exist "viliv-batch-node.exe" (
    echo [INFO] .env.prod 설정을 로드하여 viliv-batch-node.exe를 실행합니다...
    echo.

    viliv-batch-node.exe

    echo.
    echo ==========================================
    echo [VILIV-BATCH-NODE] 서비스가 종료되었습니다.
    echo ==========================================
    echo.
    pause
) else (
    echo [ERROR] viliv-batch-node.exe 파일을 찾을 수 없습니다.
    pause
)
</code></pre>

<hr />

<h2>9. 주요 특징</h2>

<ul>
  <li>Node.js 기반 배치 서버</li>
  <li>node-cron을 이용한 스케줄 배치</li>
  <li>HTTP API를 통한 수동 실행 지원</li>
  <li>pkg를 이용한 단일 실행 파일 배포</li>
  <li>Spring Batch → Node Batch 구조 전환</li>
</ul>

<hr />

<h2>10. 권장 운영 방식</h2>

<ul>
  <li>운영 서버에서는 <code>.env.prod</code> 사용</li>
  <li>배치는 cron 기반 자동 실행</li>
  <li>장애 대응을 위해 수동 실행 API 유지</li>
</ul>

</body>
</html>
