# YouTube Studio Share Automation

## 목적

`src/services/youtubeStudioShare.js`는 저장된 `storageState`를 사용해 YouTube Studio에 진입하고,
비공개 영상의 공유 대상 이메일을 추가하는 자동화 서비스다.

이 서비스는 아래 상황을 안정적으로 처리하는 것을 목표로 한다.

- 비디오 편집 화면 진입
- 비공개 공유 다이얼로그 열기
- 초대 대상 이메일 추가
- 이메일 알림 발송 여부 조정
- 저장
- 실패 시 artifact 저장

## 처리 흐름

1. Studio 홈으로 이동한다.
2. 현재 페이지가 Google 로그인 화면인지 확인한다.
3. 각 `videoId`의 편집 화면으로 이동한다.
4. 가시성 패널 진입점을 연다.
5. 비공개 공유 다이얼로그를 연다.
6. 이메일 입력창을 찾고 초대 대상을 추가한다.
7. 이메일 알림 체크박스를 원하는 상태로 맞춘다.
8. 저장 또는 완료 버튼을 눌러 반영한다.
9. 실패 시 screenshot과 HTML artifact를 저장한다.

## Locator 전략

이 자동화는 단일 selector에 강하게 의존하지 않는다.

- role 기반 locator를 우선 사용한다.
- 영문/한글 텍스트 패턴을 함께 사용해 locale 차이를 흡수한다.
- role 또는 text 기반 탐색이 실패하면 CSS locator를 fallback으로 사용한다.
- 화면이 즉시 그려지지 않는 경우 재시도 기반으로 기다린다.

이 전략의 목적은 YouTube Studio의 UI 텍스트 변경, locale 차이, 접근성 속성 차이에 대응하는 것이다.

## 요소별 탐색 상세

### 1. Visibility panel 진입점

찾는 대상:

- 비디오 편집 화면에서 가시성 또는 공개 상태 영역을 여는 버튼 또는 링크

우선 탐색:

- `page.getByRole('button', { name: /visibility/i })`
- `page.getByRole('button', { name: /가시성|공개 상태|공개 설정/ })`
- `page.getByRole('button', { name: /동영상 공개 상태 수정/ })`
- 동일 패턴의 `link`
- 동일 패턴의 `getByText(...)`

Fallback:

- `page.locator('ytcp-video-metadata-visibility #select-button')`

비고:

- 진입점을 찾지 못해도 즉시 실패시키지 않고 경고 로그를 남긴 뒤 다음 단계로 진행한다.

### 2. Share privately 진입점

찾는 대상:

- 비공개 공유 다이얼로그를 여는 버튼 또는 링크

우선 탐색 패턴:

- `share privately`
- `private share`
- `비공개로 공유`
- `비공개 공유`

탐색 방식:

- `button`
- `link`
- `text`

비고:

- 이 진입점은 실제 공유 플로우의 핵심이므로 찾지 못하면 에러를 발생시킨다.

### 3. Share dialog 본체

찾는 대상:

- 비공개 공유 다이얼로그 컨테이너

우선 탐색:

- `page.getByRole('dialog', { name: /share privately/i })`
- `page.getByRole('dialog', { name: /동영상 비공개 공유/ })`

Fallback:

- `page.locator('ytcp-private-video-sharing-dialog tp-yt-paper-dialog')`

비고:

- 다이얼로그는 렌더링 지연 가능성이 있어 재시도 기반으로 기다린다.

### 4. Invitee input

찾는 대상:

- 초대 대상 이메일을 입력하는 textbox

우선 탐색:

- `dialog.getByRole('textbox', { name: /share with people/i })`
- `dialog.getByRole('textbox', { name: /invitees?/i })`
- `dialog.getByRole('textbox', { name: /사용자와 공유/ })`
- `dialog.getByRole('textbox', { name: /초대 대상자/ })`
- 동일 패턴의 `getByLabel(...)`

Fallback:

- `dialog.locator('ytcp-chip-bar input.text-input')`
- `dialog.locator('input[aria-label=\"초대 대상자\"]')`
- `dialog.locator('input[type=\"email\"]')`

비고:

- 실제 이메일 추가는 각 주소를 입력한 뒤 `Enter`를 눌러 chip 형태로 반영한다.

### 5. Notify checkbox

찾는 대상:

- 이메일 알림 발송 여부를 제어하는 체크박스

우선 탐색 패턴:

- `notify via email`
- `email.*notification`
- `이메일.*알림`

비고:

- 현재 체크 상태와 원하는 상태를 비교한 뒤 필요할 때만 클릭한다.
- 체크박스를 찾지 못하면 경고 로그만 남기고 전체 작업을 실패시키지는 않는다.

### 6. Save / Done button

찾는 대상:

- 공유 설정을 반영하는 저장 또는 완료 버튼

우선 탐색 패턴:

- `done`
- `save`
- `완료`
- `저장`

비고:

- 버튼이 보이고 활성화된 경우에만 클릭한다.

## 인증 실패 처리

현재 페이지 URL에 `accounts.google.com`이 포함되면 세션이 깨진 것으로 판단한다.

이 경우:

- `AUTHENTICATION_REQUIRED` 에러를 발생시킨다.
- 상위 작업 흐름은 이를 재인증 필요 상태로 처리해야 한다.

## Dry-run 동작

`dryRun`이 `true`이면 아래 동작을 실제로 수행하지 않는다.

- 이메일 입력
- 이메일 알림 옵션 변경
- 저장 버튼 클릭

대신 예정된 작업 내용을 로그로 남긴다.

## 실패 시 artifact

비디오 처리 중 예외가 발생하면 아래 artifact를 저장한다.

- screenshot PNG
- 현재 페이지 HTML

저장 경로는 `config.artifactsDir/<jobId>` 기준이며, 파일명은 `<videoId>-<prefix>` 규칙을 따른다.
