# Release Notes

## 2026-04-04

### Backend / Agent

- YouTube 비공개 공유 플로우를 단일 서버 중심 구조에서 `connection`, `loginSession`, `agent` 기반 하이브리드 모델로 전환했습니다.
- 로컬 agent가 로그인 브라우저 실행, 서버 polling, 작업 claim, 공유 자동화 실행을 담당하도록 역할을 분리했습니다.
- `connection` / `loginSession` / `job` 상태를 중심으로 서버와 agent 간 작업 흐름을 재정의했습니다.
- agent 전용 인증 미들웨어와 agent API 라우트를 추가해 로그인 완료 보고와 작업 완료/실패 보고를 처리하도록 확장했습니다.
- 공유 작업 실행 시 사용자별 세션을 기준으로 처리하도록 관련 서비스와 저장소 구성을 보강했습니다.

### Automation

- `interactiveLogin` 실행 흐름을 현재 하이브리드 agent 구조에 맞게 조정했습니다.
- YouTube Studio 자동화에서 로그인 브라우저 실행 안정성을 개선했습니다.
- YouTube Studio UI 탐색 locator를 보강해 비공개 공유 진입점, 다이얼로그, 입력창 탐색 실패 가능성을 줄였습니다.
- 더 이상 사용하지 않는 구형 Chrome storage state 스크립트 의존을 제거했습니다.

### Docs / Repository

- YouTube Studio 공유 자동화의 단계, locator 전략, fallback 정책을 문서화했습니다.
- `youtubeStudioShare.js` 내부 함수들에 한글 JSDoc을 추가해 자동화 단계별 책임을 코드에서 바로 읽을 수 있게 했습니다.
- JetBrains 프로젝트 파일을 무시하도록 `.gitignore`를 정리했습니다.

### Changed Files

- `.env.example`
- `.gitignore`
- `README.md`
- `agent/config.js`
- `agent/index.js`
- `agent/services/agentLoginService.js`
- `agent/services/agentRunner.js`
- `agent/services/agentShareService.js`
- `agent/services/serverClient.js`
- `docs/mvp-remote-session-architecture.md`
- `docs/youtube-studio-share.md`
- `package.json`
- `scripts/interactiveLogin.js`
- `src/app.js`
- `src/config.js`
- `src/middleware/agentAuth.js`
- `src/middleware/auth.js`
- `src/routes/agent.js`
- `src/routes/connections.js`
- `src/routes/jobs.js`
- `src/routes/session.js`
- `src/server.js`
- `src/services/agentJobService.js`
- `src/services/connectionService.js`
- `src/services/connectionStore.js`
- `src/services/jobQueue.js`
- `src/services/jobStore.js`
- `src/services/loginSessionLauncher.js`
- `src/services/loginSessionService.js`
- `src/services/loginSessionStore.js`
- `src/services/sessionService.js`
- `src/services/shareService.js`
- `src/services/youtubeStudioShare.js`

## 2026-04-03

### Repository / Setup

- 재현 가능한 설치를 위해 `package-lock.json`을 추가했습니다.
- `.env.example`에 `ALLOWED_ORIGINS` 관련 안내를 보강해 로컬 실행 설정을 더 명확히 했습니다.

### Changed Files

- `.env.example`
- `package-lock.json`

## 2026-04-02

### Initial Backend

- Node.js + Express 기반 YouTube private share automation 서버를 초기 구성했습니다.
- 서버 진입점, 라우트, 인증 미들웨어, 에러 핸들러, 설정 로더를 추가했습니다.
- 작업 큐, 작업 저장소, 세션 서비스, 공유 서비스, YouTube Studio 자동화 서비스의 기본 구조를 만들었습니다.
- `interactiveLogin` 스크립트와 Docker 관련 파일을 포함해 로컬 실행 및 컨테이너 실행 기반을 준비했습니다.

### API / Automation

- job API 응답 계약을 정리하고 Studio 자동화 흐름을 개선했습니다.
- 실패 artifact 저장 경로와 관련 git 추적 설정을 정리했습니다.
- 공유 서비스와 Studio 자동화 서비스에 AGENTS 규칙 기반 no-else 리팩토링을 반영했습니다.

### Docs / Governance

- README를 여러 차례 보강해 런타임 구조, 요청 흐름, 자동화 흐름을 코드 기준으로 설명하도록 확장했습니다.
- 저장소 작업 규칙을 담은 `AGENTS.md`를 추가했습니다.
- 로컬 Codex 서버 런타임 파일을 무시하도록 `.gitignore`를 정리했습니다.

### Changed Files

- `.dockerignore`
- `.env.example`
- `.gitignore`
- `AGENTS.md`
- `Dockerfile`
- `README.md`
- `data/.gitkeep`
- `package.json`
- `scripts/interactiveLogin.js`
- `src/app.js`
- `src/config.js`
- `src/middleware/auth.js`
- `src/middleware/errorHandler.js`
- `src/routes/health.js`
- `src/routes/jobs.js`
- `src/routes/session.js`
- `src/server.js`
- `src/services/jobQueue.js`
- `src/services/jobStore.js`
- `src/services/sessionService.js`
- `src/services/shareService.js`
- `src/services/youtubeStudioShare.js`
- `src/utils/fs.js`
- `src/utils/logger.js`
