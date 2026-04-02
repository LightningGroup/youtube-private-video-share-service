# youtube-private-share-server

Express + Playwright 기반 API 서버입니다. YouTube Studio에서 **Private(비공개) 영상의 공유 대상 이메일 추가 자동화**를 브라우저 UI 조작 방식으로 수행합니다.

> 핵심: 브라우저 자동화는 서버에서만 실행되고, 프론트엔드(예: Netlify React 앱)는 API 호출만 담당합니다.

## 왜 브라우저 자동화가 필요한가

YouTube Studio의 private 공유 편집은 공식 공개 API로 직접 대체하기 어렵고, 내부 비공식 API 호출은 안정성/정책 측면에서 리스크가 큽니다. 이 서버는 Playwright로 Studio UI를 직접 조작해 작업을 수행합니다.

- ❌ Google 계정 이메일/비밀번호 저장 안 함
- ❌ 비공식 YouTube 내부 API 직접 호출 안 함
- ✅ Playwright UI 자동화만 사용
- ✅ 구식 `youtube.com/edit?video_id=...&nps=1` 방식 미사용
- ✅ 취약한 `.yt-uix-*` 셀렉터 미사용

## 주요 기능

- Express REST API
- `storageState.json` 업로드 기반 세션 인증
- Job Queue (기본 concurrency = 1)
- Job 상태/요약/결과/로그 조회
- 실패 시 screenshot + HTML artifact 저장
- 파일시스템 기반 저장 (DB 없이 시작)
- Docker/Render/Railway 배포 가능 구조

## 프로젝트 구조

```text
.
├─ package.json
├─ Dockerfile
├─ .env.example
├─ src
│  ├─ app.js
│  ├─ server.js
│  ├─ config.js
│  ├─ middleware
│  │  ├─ auth.js
│  │  └─ errorHandler.js
│  ├─ routes
│  │  ├─ health.js
│  │  ├─ session.js
│  │  └─ jobs.js
│  ├─ services
│  │  ├─ jobQueue.js
│  │  ├─ jobStore.js
│  │  ├─ sessionService.js
│  │  ├─ shareService.js
│  │  └─ youtubeStudioShare.js
│  └─ utils
│     ├─ fs.js
│     └─ logger.js
├─ scripts
│  └─ interactiveLogin.js
└─ data
   └─ .gitkeep
```

실행 중 생성/사용되는 저장 경로:

- `data/storageState/storageState.json`
- `data/jobs/<jobId>.json`
- `data/artifacts/<jobId>/*`
- `data/tmp/*`

## 환경 변수

`.env.example` 참고:

- `PORT=3000`
- `ADMIN_TOKEN=change-me`
- `ALLOWED_ORIGINS=https://your-netlify-site.netlify.app`
- `STORAGE_STATE_PATH=./data/storageState/storageState.json`
- `ARTIFACTS_DIR=./data/artifacts`
- `JOBS_DIR=./data/jobs`
- `TMP_DIR=./data/tmp`
- `PLAYWRIGHT_HEADLESS=true`
- `DEFAULT_LOCALE=auto`
- `JOB_HISTORY_LIMIT=100`

## 로컬 실행

```bash
npm install
cp .env.example .env
npm run dev
```

## storageState 기반 인증 방식

운영 서버에서 Google 로그인 UI를 직접 띄우는 방식 대신, 인증된 Playwright `storageState.json`을 업로드해 재사용합니다.

### 1) 로컬에서 storageState 생성

```bash
npm run interactive-login
```

- 브라우저가 열리면 Google 로그인/2FA 포함 수동 완료
- Studio 진입 확인 후 터미널에서 Enter
- `STORAGE_STATE_PATH`에 세션 파일 저장

### 2) 서버에 업로드

```bash
curl -X POST "http://localhost:3000/api/session/storage-state" \
  -H "Authorization: Bearer change-me" \
  -F "storageState=@./data/storageState/storageState.json;type=application/json"
```

## API 계약

### `GET /health`

```json
{
  "ok": true,
  "service": "youtube-private-share-server",
  "version": "1.0.0"
}
```

### `GET /api/session/status` (Bearer 필요)

```json
{
  "authenticated": true,
  "hasStorageState": true,
  "updatedAt": "2026-04-02T12:00:00.000Z"
}
```

### `POST /api/session/storage-state` (Bearer 필요)

- multipart/form-data
- file field: `storageState`

### `DELETE /api/session/storage-state` (Bearer 필요)

저장된 세션 파일 삭제.

### `POST /api/jobs/share` (Bearer 필요)

요청 예시:

```json
{
  "videoIds": ["AbCdEf12345"],
  "emailsToAdd": ["a@gmail.com", "b@gmail.com"],
  "disableEmailNotification": true,
  "dryRun": false,
  "locale": "auto"
}
```

응답 예시:

```json
{
  "jobId": "job_xxx",
  "status": "queued"
}
```

### `GET /api/jobs` (Bearer 필요)

최근 작업 목록(최신순).

### `GET /api/jobs/:jobId` (Bearer 필요)

작업 상세:

- jobId
- status (`queued | running | success | partial | failed`)
- createdAt / startedAt / finishedAt
- request
- summary
- results
- logs

### `GET /api/jobs/:jobId/artifacts/:fileName` (Bearer 필요)

작업 중 생성된 스크린샷/HTML 아티팩트 다운로드.

## 표준 에러 응답

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "videoIds is required"
  }
}
```

## 자동화 동작 개요

- Studio 페이지로 이동
- Visibility/Private 관련 UI 확인
- Share privately 진입
- 이메일 입력 + 중복 제거(요청 단계)
- 이메일 알림 옵션 반영
- 저장
- 실패 시 screenshot + HTML 스냅샷 저장

영어/한국어 UI 라벨 텍스트를 일부 패턴으로 대응하며, selector 패턴은 `src/services/youtubeStudioShare.js`에 집중되어 있습니다. UI 변경 시 이 파일을 우선 수정하세요.

## 보안 주의사항

- `ADMIN_TOKEN`은 반드시 강력한 값 사용
- `ALLOWED_ORIGINS`를 Netlify 배포 도메인으로 제한
- 업로드된 `storageState.json`은 민감정보이므로 접근권한/볼륨 보안 필수
- 로그에 이메일 전체를 남기지 않고 일부 마스킹 처리

## Render / Railway 배포 가이드

### Docker 기반 배포

이 저장소는 Playwright 공식 이미지 기반 Dockerfile을 포함합니다.

```bash
docker build -t youtube-private-share-server .
docker run -p 3000:3000 \
  -e ADMIN_TOKEN=change-me \
  -e ALLOWED_ORIGINS=https://your-netlify-site.netlify.app \
  -v $(pwd)/data:/app/data \
  youtube-private-share-server
```

### Persistent Volume 필요성

다음 파일을 유지해야 서버 재시작 이후에도 상태가 보존됩니다.

- storage state 파일
- jobs 이력
- artifacts

따라서 Render/Railway에서 `/app/data`에 해당하는 persistent disk/volume을 연결하세요.

### Render 예시

1. 새 Web Service 생성 (Docker 사용)
2. Environment Variables 설정 (`ADMIN_TOKEN`, `ALLOWED_ORIGINS` 등)
3. Persistent Disk 연결 후 mount path를 `/app/data`로 지정
4. Deploy

### Railway 예시

1. Docker 배포 프로젝트 생성
2. Variables 설정
3. Volumes에서 `/app/data` 마운트
4. Deploy

## 프론트 연동 팁

- 프론트는 이 서버만 호출
- 작업 시작: `POST /api/jobs/share`
- 상태 폴링: `GET /api/jobs/:jobId`
- 실패 시 artifact URL을 노출해 운영자가 디버깅

## 제한사항 / 유지보수 포인트

- YouTube Studio UI 변경 시 locator 수정 필요
- 세션 만료 시 storageState 재업로드 필요
- 기본 queue는 1개 job 직렬 처리(안전성 우선)

