# youtube-private-share-server

YouTube Studio의 private 영상 초대를 자동화하는 하이브리드 구조 서버다.

핵심은 서버가 브라우저를 직접 돌리지 않는다는 점이다.

- 서버는 `connection`, `loginSession`, `job` 상태를 관리한다.
- 로컬 에이전트는 사용자 PC에서 Google 로그인과 YouTube Studio 자동화를 수행한다.
- 프론트는 서버 API만 호출한다.

## 아키텍처

구성은 세 층으로 나뉜다.

1. 서버
- Express API
- connection/loginSession/job 저장
- agent callback 수신

2. 로컬 에이전트
- Google 로그인 브라우저 실행
- storageState 로컬 저장
- YouTube Studio 자동화 실행
- 서버에 완료/실패 보고

3. 프론트
- 앱 사용자 인증
- connection 생성
- loginSession 생성
- job 생성과 결과 표시

## 현재 동작 모델

### connection
사용자와 YouTube 세션의 논리 연결이다.

주요 상태:
- `pending_login`
- `authenticated`
- `reauth_required`

### loginSession
사용자가 지금 로그인 중인지 추적하는 세션이다.

주요 상태:
- `ready`
- `waiting_for_user`
- `completed`
- `expired`
- `failed`

### job
private 영상 초대 작업이다.

주요 상태:
- `queued`
- `claimed`
- `success`
- `partial`
- `failed`
- `needs_reauth`

## 주요 API

### 사용자 API

`GET /health`

`GET /api/connections`

`POST /api/connections`

`GET /api/connections/:connectionId`

`POST /api/connections/:connectionId/login-sessions`

`GET /api/login-sessions/:loginSessionId`

`POST /api/login-sessions/:loginSessionId/start`

`POST /api/login-sessions/:loginSessionId/expire`

`POST /api/jobs/share`

`GET /api/jobs`

`GET /api/jobs/:jobId`

`GET /api/jobs/:jobId/artifacts/:fileName`

### agent API

모든 agent API는 아래 헤더가 필요하다.

- `Authorization: Bearer <ADMIN_TOKEN>`
- `x-agent-id: <AGENT_ID>`

엔드포인트:

`POST /api/agent/login-sessions/:loginSessionId/complete`

`POST /api/agent/login-sessions/:loginSessionId/fail`

`POST /api/agent/jobs/claim`

`POST /api/agent/jobs/:jobId/complete`

`POST /api/agent/jobs/:jobId/fail`

## 로컬 실행

```bash
npm install
cp .env.example .env
npm run dev
```

## agent 실행

에이전트는 같은 저장소에서 로컬로 실행한다.

기본 루프:

```bash
npm run agent
```

단일 로그인 세션 처리:

```bash
node agent/index.js login <loginSessionId>
```

단일 poll만 수행하고 종료하려면:

```bash
AGENT_RUN_ONCE=true npm run agent
```

## 권장 흐름

1. 사용자가 `POST /api/connections` 호출
2. 사용자가 `POST /api/connections/:connectionId/login-sessions` 호출
3. 로컬 에이전트가 `node agent/index.js login <loginSessionId>` 실행
4. 사용자가 에이전트가 띄운 브라우저에서 Google 로그인과 2FA 수행
5. 에이전트가 로그인 완료를 서버에 보고
6. 사용자가 `POST /api/jobs/share` 호출
7. 에이전트가 `claim-and-run`으로 작업을 가져가 실행
8. 서버가 최종 상태와 결과를 저장

## 요청 예시

### connection 생성

```bash
curl -X POST "http://localhost:3000/api/connections" \
  -H "Authorization: Bearer change-me" \
  -H "x-user-id: demo-user" \
  -H "Content-Type: application/json" \
  -d '{"channelLabel":"main-channel"}'
```

### loginSession 생성

```bash
curl -X POST "http://localhost:3000/api/connections/conn_xxxxxxxxxxxx/login-sessions" \
  -H "Authorization: Bearer change-me" \
  -H "x-user-id: demo-user"
```

### share job 생성

```bash
curl -X POST "http://localhost:3000/api/jobs/share" \
  -H "Authorization: Bearer change-me" \
  -H "x-user-id: demo-user" \
  -H "Content-Type: application/json" \
  -d '{
    "connectionId": "conn_xxxxxxxxxxxx",
    "videoIds": ["AbCdEf12345"],
    "emailsToAdd": ["a@example.com", "b@example.com"],
    "disableEmailNotification": true,
    "dryRun": false,
    "locale": "auto"
  }'
```

### agent job claim

```bash
curl -X POST "http://localhost:3000/api/agent/jobs/claim" \
  -H "Authorization: Bearer change-me" \
  -H "x-agent-id: local-agent"
```

## 프로젝트 구조

```text
.
├─ agent
│  ├─ index.js
│  ├─ config.js
│  └─ services
├─ docs
│  └─ mvp-remote-session-architecture.md
├─ scripts
│  └─ interactiveLogin.js
├─ src
│  ├─ app.js
│  ├─ server.js
│  ├─ config.js
│  ├─ middleware
│  ├─ routes
│  ├─ services
│  └─ utils
└─ data
```

## 환경 변수

주요 값은 아래다.

- `PORT`
- `ADMIN_TOKEN`
- `ALLOWED_ORIGINS`
- `STORAGE_STATES_DIR`
- `CONNECTIONS_DIR`
- `LOGIN_SESSIONS_DIR`
- `ARTIFACTS_DIR`
- `JOBS_DIR`
- `TMP_DIR`
- `PLAYWRIGHT_HEADLESS`
- `DEFAULT_LOCALE`
- `JOB_HISTORY_LIMIT`
- `JOB_POLL_INTERVAL_MS`
- `LOGIN_SESSION_TTL_MS`
- `GOOGLE_SIGNIN_URL`
- `AGENT_ID`
- `AGENT_SERVER_BASE_URL`
- `AGENT_POLL_INTERVAL_MS`
- `AGENT_RUN_ONCE`

## 현재 한계

- 로그인 브라우저는 아직 원격 스트리밍이 아니라 로컬 에이전트에서 직접 열린다.
- 앱 사용자 인증은 임시로 `x-user-id` 헤더를 사용한다.
- storageState는 로컬 에이전트 파일 시스템에 저장된다고 가정한다.
- README 기준 흐름은 하이브리드 MVP이며, 순수 SaaS 원격 브라우저 구조는 아직 구현하지 않았다.
