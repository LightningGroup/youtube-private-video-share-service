# YouTube Studio Remote Session MVP

## 1. 문제 재정의

이 제품의 목표는 사용자가 `storageState.json` 파일을 직접 준비해서 업로드하는 것이 아니다.

목표는 아래 두 가지다.

- private 영상에 특정 이메일을 추가해서 초대한다.
- YouTube Studio에서만 가능한 세부 공유 플로우를 자동화한다.

이 목표는 OAuth 기반 API 앱보다 `사용자별 YouTube Studio 브라우저 세션을 서버가 관리하는 SaaS`에 가깝다.

즉, 이 저장소는 앞으로 아래 방향으로 재정의되어야 한다.

- 사용자는 앱에서 본인 계정을 인증한다.
- 사용자는 서버가 준비한 로그인 세션에서 직접 Google 로그인과 2FA를 수행한다.
- 서버는 로그인 결과를 사용자별 브라우저 세션으로 저장한다.
- 이후 공유 작업은 저장된 사용자 세션을 사용해 수행한다.

## 2. 왜 기존 구조로는 부족한가

현재 저장소는 `단일 전역 storageState`를 전제로 한다.

- `src/config.js`는 `storageStatePath` 하나만 가진다.
- `src/services/sessionService.js`는 업로드된 파일을 전역 경로에 복사한다.
- `src/services/shareService.js`는 실행 시 항상 같은 storageState를 사용한다.
- `scripts/interactiveLogin.js`도 단일 출력 파일을 만든다.

이 구조는 아래 요구사항을 만족하지 못한다.

- 여러 사용자가 각자 다른 Google 계정을 연결하는 경우
- 한 사용자의 세션이 만료되었을 때 해당 사용자만 재인증해야 하는 경우
- 작업 실행 시 어떤 YouTube 계정으로 동작할지 명시해야 하는 경우
- 사용자 A의 세션과 사용자 B의 세션이 절대 섞이면 안 되는 경우

## 3. MVP 목표

MVP는 아래 한 가지 유스케이스만 정확히 처리하면 된다.

1. 앱 사용자가 로그인한다.
2. 사용자가 YouTube 계정 연결을 시작한다.
3. 사용자가 서버가 만든 브라우저 세션에서 직접 Google 로그인과 2FA를 완료한다.
4. 서버가 해당 사용자의 세션을 저장한다.
5. 사용자가 비디오 URL 또는 비디오 ID와 이메일 목록을 입력한다.
6. 서버가 해당 사용자 세션으로 YouTube Studio에 접속해 private invite를 수행한다.
7. 서버가 결과, 로그, 실패 아티팩트를 저장한다.

MVP에서 의도적으로 제외할 범위는 아래와 같다.

- 사용자 1명당 여러 개의 YouTube 연결 관리
- 자동 세션 복구
- 고급 동시성 제어
- 분산 큐
- 초대 결과의 외부 콜백
- 다른 Studio 자동화 기능

## 4. 제품 경계

### 4.1 앱 인증과 Google 인증 분리

앱 로그인과 Google 로그인은 별개다.

- 앱 로그인은 우리 서비스 사용자 식별용이다.
- Google 로그인은 YouTube Studio 자동화에 사용할 외부 세션 획득용이다.

이 둘을 섞으면 권한 모델이 불명확해진다.

### 4.2 프론트 역할

프론트는 아래 책임만 가진다.

- 앱 사용자 세션 유지
- YouTube 연결 시작 버튼 제공
- 로그인 상태 표시
- 공유 작업 입력과 결과 표시

프론트는 아래 책임을 가지지 않는다.

- Google 세션 쿠키 추출
- storageState 생성
- 로그인 결과 파일 전송

### 4.3 백엔드 역할

백엔드는 아래 책임을 가진다.

- 사용자별 로그인 세션 생성
- 사용자별 storageState 저장과 복원
- 작업 큐 실행
- YouTube Studio UI 자동화
- 로그와 아티팩트 저장

## 5. 핵심 도메인 모델

### 5.1 User

앱 사용자다.

예시 필드:

- `id`
- `email`
- `createdAt`

### 5.2 YouTubeAccountConnection

앱 사용자와 YouTube Studio 세션의 연결이다.

예시 필드:

- `id`
- `userId`
- `status`
- `storageStatePath`
- `channelLabel`
- `lastAuthenticatedAt`
- `expiresAt`
- `lastHealthCheckAt`
- `createdAt`
- `updatedAt`

상태는 아래 집합을 기본으로 둔다.

- `pending_login`
- `authenticated`
- `expired`
- `reauth_required`
- `revoked`

### 5.3 LoginSession

지금 진행 중인 연결 플로우를 나타낸다.

예시 필드:

- `id`
- `userId`
- `connectionId`
- `status`
- `loginUrl`
- `startedAt`
- `completedAt`
- `expiresAt`

상태는 아래 집합을 기본으로 둔다.

- `created`
- `ready`
- `waiting_for_user`
- `completed`
- `expired`
- `failed`

### 5.4 ShareJob

실제 private invite 요청이다.

예시 필드:

- `id`
- `userId`
- `connectionId`
- `videoIds`
- `inviteEmails`
- `status`
- `summary`
- `results`
- `artifactsPath`
- `createdAt`
- `startedAt`
- `finishedAt`

상태는 아래 집합을 기본으로 둔다.

- `queued`
- `running`
- `succeeded`
- `partial`
- `failed`
- `needs_reauth`

`needs_reauth`는 이 제품에서 중요하다. 브라우저 세션이 깨지는 것은 예외가 아니라 정상 시나리오다.

## 6. 시스템 구성

### 6.1 권장 모듈

- `ConnectionService`
  - 연결 생성
  - 연결 상태 조회
  - 연결 만료 처리

- `LoginSessionService`
  - 로그인 세션 생성
  - 로그인 완료 판정
  - 로그인 세션 만료 처리

- `BrowserSessionStore`
  - 사용자별 storageState 저장 경로 계산
  - 저장
  - 읽기
  - 삭제

- `BrowserSessionManager`
  - Playwright context 생성
  - context health check
  - 세션 저장과 복원

- `SharePrivateVideoUseCase`
  - 입력 검증
  - connection 조회
  - queue enqueue
  - 실행 결과 집계

- `YouTubeStudioShareAdapter`
  - 실제 UI 자동화
  - locator 전략 관리
  - artifact 저장

### 6.2 저장소 구조 제안

`data` 아래 구조를 사용자별 경계가 드러나도록 나눈다.

```text
data/
  connections/
    <connectionId>.json
  loginSessions/
    <loginSessionId>.json
  storageStates/
    <connectionId>.json
  jobs/
    <jobId>.json
  artifacts/
    <jobId>/
```

이 구조의 목적은 단순하다.

- 메타데이터 파일과 브라우저 세션 파일을 분리한다.
- 전역 단일 파일을 제거한다.
- job과 connection을 연결할 수 있게 한다.

## 7. 로그인 플로우

### 7.1 목표 플로우

1. 사용자가 `POST /api/connections` 호출
2. 서버가 `YouTubeAccountConnection`을 `pending_login`으로 생성
3. 서버가 `LoginSession` 생성
4. 서버가 Playwright persistent context 또는 임시 로그인 컨텍스트를 준비
5. 사용자가 그 세션에서 Google 로그인과 2FA를 직접 수행
6. 서버가 Studio 진입 성공을 확인
7. 서버가 storageState를 `data/storageStates/<connectionId>.json`에 저장
8. 서버가 connection 상태를 `authenticated`로 변경

### 7.2 주의점

- storageState는 서버 내부 구현 세부다.
- 프론트가 로그인 쿠키를 읽어 전달하는 구조를 채택하지 않는다.
- 로그인 세션은 만료 시간을 가져야 한다.
- 로그인 완료 판정은 `studio.youtube.com` 접근 가능 여부로 확인한다.

## 8. 공유 작업 플로우

1. 사용자가 `POST /api/jobs/share` 호출
2. 요청에 `connectionId`가 포함된다.
3. 서버가 해당 connection 소유자가 현재 사용자와 일치하는지 확인한다.
4. 서버가 connection 상태를 확인한다.
5. 상태가 `authenticated`가 아니면 즉시 거절한다.
6. 서버가 job을 `queued`로 저장한다.
7. worker가 해당 connection의 storageState를 사용해 Studio 자동화를 실행한다.
8. 인증 실패가 감지되면 job 상태를 `needs_reauth`로 종료한다.
9. 일반 오류면 `failed` 또는 `partial`로 종료한다.

## 9. 리스크와 운영 원칙

### 9.1 기술 리스크

- Google 로그인 플로우와 2FA
- 보안 경고 또는 캡차
- YouTube Studio UI 변경
- 브라우저 세션 만료
- 멀티유저 환경에서 세션 혼선

### 9.2 운영 원칙

- 사용자 세션 경계를 파일 경로와 도메인 모델 양쪽에서 강제한다.
- 실패 시 항상 artifact를 남긴다.
- 세션 만료는 에러가 아니라 도메인 상태로 다룬다.
- Studio locator 변경 가능성을 고려해 UI 전략을 한 모듈에 모은다.

## 10. 현재 코드 기준 구현 계획

이 구현 계획은 대규모 재설계보다 `검증 가능한 최소 변경` 순서를 우선한다.

### Phase 1. 전역 storageState 제거 준비

목표는 전역 storageState 전제를 깨는 것이다.

변경 대상:

- `src/config.js`
  - `storageStatePath` 단일 경로를 제거한다.
  - `storageStatesDir`, `connectionsDir`, `loginSessionsDir`를 추가한다.

- `src/server.js`
  - 새 디렉터리 초기화를 추가한다.

- `src/services/sessionService.js`
  - 파일 업로드 서비스라는 성격을 제거한다.
  - 전역 경로 기반 상태 조회 로직을 분리한다.

산출물:

- connection 단위 storageState 경로 계산 함수
- 새 디렉터리 준비 로직

### Phase 2. Connection 저장소 도입

목표는 사용자별 YouTube 연결 메타데이터를 저장하는 것이다.

새 파일:

- `src/services/connectionStore.js`
- `src/services/connectionService.js`

책임:

- connection 생성
- connection 조회
- userId 소유권 검증
- 상태 전이

핵심 설계:

- `connectionId`를 기준으로 storageState 파일과 메타데이터 파일을 연결한다.
- 기존 `sessionService`는 connection 중심 서비스로 흡수하거나 축소한다.

### Phase 3. LoginSession 도입

목표는 로그인 시작과 완료 확인을 도메인 모델로 올리는 것이다.

새 파일:

- `src/services/loginSessionStore.js`
- `src/services/loginSessionService.js`

새 라우트 후보:

- `POST /api/connections`
- `POST /api/connections/:connectionId/login-sessions`
- `GET /api/connections/:connectionId`
- `GET /api/login-sessions/:loginSessionId`

주의:

- MVP에서는 실제 원격 로그인 화면 전달 방식이 확정되기 전까지 `interactiveLogin` 성격의 내부 구현을 재사용할 수 있다.
- 하지만 인터페이스는 `script 실행`이 아니라 `login session 생성`으로 감싸야 한다.

### Phase 4. Share 요청에 connectionId 강제

목표는 작업 실행 시 어떤 세션을 써야 하는지 명시하는 것이다.

변경 대상:

- `src/services/shareService.js`
  - `validateShareRequest`에 `connectionId` 검증 추가
  - `runShareJob`에서 전역 session 조회 제거
  - connection 상태 확인과 storageState 경로 획득을 `connectionService`에 위임

- `src/routes/jobs.js`
  - 현재 사용자와 `connectionId` 소유권을 검증하도록 변경

- `src/services/jobQueue.js`
  - job summary 외에도 `userId`, `connectionId`를 request 또는 메타데이터에 남긴다.

산출물:

- 전역 세션 의존 제거
- 사용자별 작업 격리

### Phase 5. Studio 자동화 계층에서 인증 실패를 도메인 상태로 승격

목표는 세션 만료를 예외가 아니라 `needs_reauth`로 처리하는 것이다.

변경 대상:

- `src/services/youtubeStudioShare.js`
  - Studio 홈 진입 실패 또는 로그인 화면 리다이렉트 감지 로직 추가
  - 인증 실패를 구분 가능한 에러 코드로 반환

- `src/services/shareService.js`
  - 인증 실패를 `failed`가 아니라 `needs_reauth`로 매핑

산출물:

- 로그인 만료와 일반 UI 실패의 구분

### Phase 6. 기존 업로드 API 제거

목표는 제품 모델과 맞지 않는 엔드포인트를 걷어내는 것이다.

변경 대상:

- `src/routes/session.js`
  - `POST /session/storage-state` 제거
  - 기존 status/delete API는 connection 기반 API로 대체

- `README.md`
  - 사용자 업로드 모델을 제거
  - 사용자별 연결 모델로 문서 갱신

### Phase 7. 보안과 운영 최소선 추가

MVP에서도 아래는 필요하다.

- storageState 파일 권한 제한
- connection별 artifact와 job 조회 권한 검증
- 세션 파일 삭제 정책
- 실패 로그와 스크린샷 표준화

## 11. 파일별 구체 변경 메모

### `src/config.js`

- `storageStatePath` 제거
- `storageStatesDir`
- `connectionsDir`
- `loginSessionsDir`

### `src/services/sessionService.js`

- 삭제 후보 또는 축소 후보
- 남긴다면 `BrowserSessionStore` 성격으로 축소

### `src/services/shareService.js`

- `connectionId` 검증
- `getStorageStatePathOrThrow()` 호출 제거
- `connectionService.getUsableStorageStatePath(...)` 같은 명시적 메서드 사용

### `src/services/youtubeStudioShare.js`

- 인증 실패 감지
- `options.connectionId`를 받아 artifact, log, telemetry에 반영 가능하게 변경

### `src/services/jobQueue.js`

- 멀티유저 메타데이터 저장
- 향후 connection 단위 동시성 제어를 넣을 자리 확보

### `src/routes/session.js`

- 삭제 또는 `connections` 라우트로 교체

### `scripts/interactiveLogin.js`

- 즉시 삭제하지 않는다.
- 초기 MVP에서는 내부 운영 도구 또는 로그인 구현 프로토타입으로 유지 가능하다.
- 다만 제품의 공식 진입점으로 두지 않는다.

## 12. 추천 구현 순서

실제 작업 순서는 아래가 가장 안전하다.

1. `config`와 디렉터리 구조부터 connection 중심으로 변경
2. `connectionStore`와 `connectionService` 추가
3. `shareService`에 `connectionId` 도입
4. `job`에 `userId`, `connectionId` 기록
5. `youtubeStudioShare`에 인증 실패 구분 추가
6. 마지막에 `session` 업로드 API 제거

이 순서를 지키면 동작 변경과 구조 변경을 단계적으로 검증할 수 있다.

## 13. MVP 성공 기준

아래 조건을 만족하면 MVP가 성립한다.

- 사용자 A가 본인 Google 계정을 연결할 수 있다.
- 사용자 B가 연결한 세션과 혼선이 없다.
- 사용자 A의 `connectionId`로만 작업이 실행된다.
- 세션 만료 시 `needs_reauth`가 반환된다.
- private invite 성공/실패와 artifact를 조회할 수 있다.

이 문서는 현재 저장소를 `단일 전역 세션 도구`에서 `사용자별 원격 세션 기반 SaaS`로 전환하기 위한 최소 설계 기준이다.
