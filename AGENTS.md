# AGENTS.md

## 1) Purpose
- 이 문서는 이 저장소에서 Codex와 개발자가 변경을 만들 때 따르는 고정 작업 규칙을 정의한다.
- 모든 변경은 **기존 동작 보존, 명확한 책임 분리, 검증 가능한 최소 변경**을 기준으로 수행한다.
- 구현 세부보다 **경계(boundary), 책임(responsibility), 변경 축(change axis)** 중심으로 설계 결정을 내린다.

## 2) Project Facts
아래 내용은 현재 저장소에서 확인된 사실만 기록한다.

- 언어: JavaScript (Node.js). (`package.json`, `src/**/*.js`)
- 런타임: Node.js `>=20`. (`package.json`)
- 모듈 시스템: CommonJS (`require`, `module.exports`). (`src/app.js`, `src/server.js`)
- 서버 프레임워크: Express 4. (`package.json`, `src/app.js`)
- 주요 인프라 라이브러리:
  - Playwright (브라우저 자동화)
  - Multer (파일 업로드)
  - dotenv (환경변수 로드)
  - cors (CORS 처리)
- 앱 진입점:
  - 프로세스 진입: `src/server.js`
  - Express 앱 구성: `src/app.js`
- 실행 스크립트: (`package.json`)
  - `npm start` → `node src/server.js`
  - `npm run dev` → `nodemon src/server.js`
  - `npm run interactive-login` → `node scripts/interactiveLogin.js`
- 주요 디렉터리 구조:
  - `src/routes` (HTTP 엔드포인트)
  - `src/middleware` (인증/에러 처리)
  - `src/services` (유스케이스, 자동화, 저장소 로직)
  - `src/utils` (파일시스템, 로깅 유틸)
  - `scripts` (운영용 스크립트)
  - `data` (jobs/artifacts/storageState/tmp 저장 경로)
- 환경변수 기반 설정 파일: `src/config.js`, `.env.example`.

## 3) Core Engineering Philosophy
- **FM하고 정석적인 설계**를 우선한다. 동작이 명확하고 추론 가능한 구조를 선택한다.
- **OOP + FP 혼합**을 기본 원칙으로 한다.
- 처음 구현은 **단순성 우선**으로 시작하고, 요구가 검증되면 확장한다.
- 기능은 상속보다 **합성(Composition)** 으로 성장시킨다.
- 객체는 각자 책임을 명확히 가지며, SRP(단일 책임 원칙)를 지킨다.
- 추상화는 “멋짐”이 아니라 **변경의 축**을 기준으로 도입한다.
- 도메인 규칙(유스케이스/정책)과 인프라 규칙(IO/라이브러리 의존)을 분리한다.
- 부수효과(IO, 시간, 외부 시스템 호출)는 가능한 한 시스템 가장자리로 격리한다.

## 4) Backend Architecture Guidance
- route/controller는 입력 파싱, 인증/인가 통과, 응답 반환에 집중한다.
- 인증, 검증, 오케스트레이션, 도메인 규칙, 인프라 접근을 분리한다.
- route handler는 thin 하게 유지하고 비즈니스 규칙을 직접 품지 않는다.
- validation은 별도 함수 또는 usecase/service 계층으로 분리한다.
- 파일시스템, 네트워크, 브라우저 자동화, 시간, 랜덤 생성은 boundary 계층에 모은다.
- domain/usecase 로직은 Express/Playwright 상세 구현에 과도하게 오염시키지 않는다.
- 저장소 접근은 store/repository/service 형태로 캡슐화한다.
- 상태 전이는 명시적 함수/도메인 메서드/유스케이스에서만 일으킨다.

## 5) OOP and FP Usage Rule
- OOP는 책임 있는 객체, 상태 전이, 응집된 행위, 명시적 모델링에 사용한다.
- FP는 validation, normalize, parse, map/filter/reduce, 파생 계산, DTO 변환에 사용한다.
- 상태를 가진 도메인 객체는 자신의 책임과 규칙을 내부에 모은다.
- 순수 계산 로직은 순수 함수로 유지한다.
- 객체와 순수 함수의 역할이 섞이지 않도록 경계를 유지한다.
- 기본 방향: **객체가 책임을 수행하고, 함수가 조합을 돕는다.**

## 6) Service and IO Boundary Rules
- Playwright, 파일시스템, 환경변수, HTTP 요청/응답, 시간, 랜덤 값 생성은 boundary로 취급한다.
- 이러한 부수효과는 service/adapter/repository 계층에 모은다.
- validation, 정규화, 요청 해석, 상태 계산은 가능한 순수 함수로 유지한다.
- route에서 파일 접근/브라우저 조작 로직을 직접 작성하지 않는다.
- 인프라 라이브러리 import는 필요한 가장자리 계층에 제한한다.

## 7) Code Style Rules (Hard Rules)

### 7.1 No else (Non-negotiable)
- `else`는 절대 사용하지 않는다.
- `if`는 사용 가능하다.
- 모든 분기는 guard clause / early return으로 작성한다.
- 실패, 예외, nullish, invalid input을 먼저 반환한다.
- 중첩 `if`는 평탄화한다.
- `else if`도 사용하지 않는다.
- 삼항 연산자는 허용한다. 단, 중첩 삼항은 금지한다.
- 새 코드, 리팩토링 코드, 예시 코드, 문서 예제 모두 이 규칙을 따른다.
- “기존 스타일 유지”보다 이 규칙을 우선한다.
- Codex는 생성 결과에 `else`가 남지 않도록 스스로 재점검한다.

### 7.2 Guard clause 우선
- 함수 시작부에서 실패/빠른 종료 조건을 먼저 반환한다.
- happy path는 아래로 자연스럽게 흐르게 작성한다.

### 7.3 Const-first
- `const`를 기본으로 사용한다.
- 재할당이 필요한 경우에만 `let`을 사용한다.
- `var`는 금지한다.

### 7.4 No magic numbers / No magic strings
- 의미 있는 숫자/문자열 리터럴은 상수로 승격한다.
- timeout, retry, limit, status key, 파일명 prefix, 경로 조각은 명명된 `const`로 관리한다.

### 7.5 Params rule
- 파라미터가 3개 이상이면 객체 파라미터를 우선한다.
- 핵심 식별자 1~2개만 직접 받고, 옵션/부가값은 객체로 묶는다.

### 7.6 Naming
- 이름은 역할과 책임이 드러나게 작성한다.
- `util`, `helper`, `temp`, `misc` 같은 모호한 이름 남용을 금지한다.

### 7.7 Nullish-safe iteration
- 배열 순회/array method 사용 시 nullish-safe 패턴을 선호한다.
- 예: `(items ?? []).map(...)`

## 8) JSDoc Rules
- public 함수, 유스케이스, 서비스 entry 함수, 복잡한 유틸에는 JSDoc을 작성한다.
- JSDoc은 한국어로 짧고 명료하게 작성한다.
- 주석은 “무엇을 하는지”와 “언제 쓰는지” 중심으로 적는다.
- 자명한 구현 설명 반복은 피한다.

## 9) Express Guidance
- route는 최대한 얇게 유지한다.
- 미들웨어는 인증, 검증, 에러 처리 등 역할별로 분리한다.
- 에러 응답 형식은 일관되게 유지한다.
- 요청 body 검증과 비즈니스 로직을 섞지 않는다.
- route 파일은 orchestration entrypoint 역할만 수행한다.

## 10) Playwright and Automation Guidance
- 브라우저 자동화 로직은 별도 서비스/어댑터에 집중한다.
- locator와 text pattern은 한 곳에 모아 관리한다.
- route나 job queue에서 Playwright 세부 구현을 직접 다루지 않는다.
- dry-run, artifact 저장, 세션 파일 사용, 종료 정리를 명시적 단계로 분리한다.
- browser/context/page 생명주기는 반드시 닫히도록 작성한다.
- 실패 시 디버깅 가능한 artifact와 로그를 남기는 방향을 유지한다.

## 11) Change Safety Rules
- 기존 API 계약과 파일 저장 구조를 함부로 깨지 않는다.
- 관련 없는 계층을 한 번에 건드리지 않는다.
- 동작 변경과 리팩토링을 한 커밋/한 PR에서 섞지 않는다.
- 새 라이브러리 도입은 필요성이 검증된 경우에만 수행한다.
- 기존 패턴을 먼저 따르고, 구조적 문제가 명확할 때만 새 패턴을 도입한다.
- 대규모 재설계보다 국소적이고 검증 가능한 변경을 우선한다.

## 12) Output Style for Codex
- 최소 변경으로 문제를 해결한다.
- 관련 없는 파일은 수정하지 않는다.
- 새 파일 추가 시 필요성을 설명할 수 있어야 한다.
- 리팩토링은 동작 변경과 분리한다.
- 작업 전 기존 코드 패턴을 먼저 읽고 맞춘다.
