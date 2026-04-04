const path = require('path');
const fs = require('fs/promises');
const { chromium } = require('playwright');
const config = require('../config');
const { ensureDir } = require('../utils/fs');

const UI = {
  visibilityButtons: [/visibility/i, /가시성|공개 상태|공개 설정/, /동영상 공개 상태 수정/],
  privateIndicators: [/private/i, /비공개/],
  sharePrivatelyEntry: [/share privately/i, /private share/i, /비공개로 공유/, /비공개 공유/],
  shareDialogTitles: [/share privately/i, /동영상 비공개 공유/],
  inviteeInputLabels: [/share with people/i, /invitees?/i, /사용자와 공유/, /초대 대상자/],
  notifyCheckboxLabels: [/notify via email/i, /email.*notification/i, /이메일.*알림/],
  saveButtons: [/done/i, /save/i, /완료/, /저장/],
};
const STUDIO_HOME_URL = 'https://studio.youtube.com/';
const STUDIO_VIDEO_EDIT_URL = 'https://studio.youtube.com/video';
const STUDIO_BROWSER_APPROVAL_QUERY = 'approve_browser_access=true';
const PAGE_TIMEOUT_MS = 60000;
const LOCATOR_RETRY_INTERVAL_MS = 500;
const VISIBILITY_CARD_APPEAR_ATTEMPTS = 24;
const SHARE_DIALOG_TRIGGER_ATTEMPTS = 6;
const SHARE_DIALOG_APPEAR_ATTEMPTS = 6;
const DRY_RUN_ADDED_COUNT = 0;
const DEFAULT_ADDED_COUNT = 0;
const GOOGLE_ACCOUNTS_HOST = 'accounts.google.com';
const VISIBILITY_SECTION_SELECTOR = 'ytcp-video-metadata-visibility';
const VISIBILITY_SELECT_BUTTON_SELECTOR = `${VISIBILITY_SECTION_SELECTOR} #select-button`;

/**
 * Studio 접근 승인 쿼리를 URL에 보장한다.
 * Studio 편집 화면 진입 전에 브라우저 승인 파라미터를 붙일 때 사용한다.
 */
function withStudioBrowserApproval(url) {
  if (url.includes(STUDIO_BROWSER_APPROVAL_QUERY)) {
    return url;
  }

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${STUDIO_BROWSER_APPROVAL_QUERY}`;
}

/**
 * 재로그인이 필요한 상황을 표현하는 전용 에러를 만든다.
 * Google 계정 로그인 화면으로 튕겼을 때 상위 흐름에서 구분하기 위해 사용한다.
 */
function buildAuthenticationRequiredError(message) {
  const error = new Error(message);
  error.code = 'AUTHENTICATION_REQUIRED';
  return error;
}

/**
 * 비디오 처리 성공 결과를 API 응답 형태로 정리한다.
 * dry-run 여부에 따라 추가 인원 수와 메시지를 다르게 기록할 때 사용한다.
 */
function buildSuccessResult({ videoId, payload }) {
  return {
    videoId,
    status: 'success',
    addedCount: payload.dryRun ? DRY_RUN_ADDED_COUNT : payload.emails.length,
    message: payload.dryRun ? 'Dry run completed' : 'Invites updated',
    artifacts: [],
  };
}

/**
 * 로그에 남길 이메일을 부분 마스킹한다.
 * 초대 대상 정보를 완전히 노출하지 않고 작업 로그를 남길 때 사용한다.
 */
function maskEmail(email) {
  const [name, domain] = email.split('@');
  if (!domain) return '***';
  return `${name.slice(0, 2)}***@${domain}`;
}

/**
 * 지정한 시간만큼 대기한다.
 * UI가 즉시 갱신되지 않는 구간에서 재시도 간격을 둘 때 사용한다.
 */
function wait(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

/**
 * locator 후보 중 현재 화면에 보이는 첫 요소를 찾는다.
 * locale 차이로 여러 후보를 준비한 뒤 실제 노출된 요소를 선택할 때 사용한다.
 */
async function firstVisible(locatorCandidates) {
  for (const locator of locatorCandidates) {
    if (await locator.first().isVisible().catch(() => false)) {
      return locator.first();
    }
  }
  return null;
}

/**
 * 보이는 locator 후보를 클릭하거나 Enter로 대체 실행한다.
 * 버튼과 링크가 섞여 있는 Studio UI에서 가장 먼저 동작하는 진입점을 찾을 때 사용한다.
 */
async function clickVisibleLocator(locatorCandidates) {
  for (const locator of locatorCandidates) {
    const target = locator.first();
    if (!(await target.isVisible().catch(() => false))) {
      continue;
    }

    try {
      await target.click({ force: true });
      return target;
    } catch (error) {
      try {
        await target.press('Enter');
        return target;
      } catch (pressError) {
        continue;
      }
    }
  }

  return null;
}

/**
 * 일정 횟수 동안 보이는 locator가 나타날 때까지 재시도한다.
 * 비동기 렌더링되는 Studio 패널과 다이얼로그를 기다릴 때 사용한다.
 */
async function waitForVisibleLocator(locatorCandidates, { attempts = 1, intervalMs = 0 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const visible = await firstVisible(locatorCandidates);
    if (visible) {
      return visible;
    }

    if (attempt === attempts - 1) {
      return null;
    }

    await wait(intervalMs);
  }

  return null;
}

/**
 * 비디오 편집 화면의 공개 상태 카드 후보를 만든다.
 * 렌더링 완료 여부를 확인할 때 컨테이너와 버튼/텍스트 후보를 함께 탐색한다.
 */
function buildVisibilityCardCandidates(page) {
  const candidates = [page.locator(VISIBILITY_SECTION_SELECTOR)];
  for (const pattern of UI.visibilityButtons) {
    candidates.push(page.getByText(pattern));
  }

  return candidates;
}

/**
 * 비디오 편집 화면의 공개 상태 패널 진입 후보를 만든다.
 * 실제 클릭 가능한 버튼과 링크만 추려서 패널을 열 때 사용한다.
 */
function buildVisibilityEntryCandidates(page) {
  const candidates = [page.locator(VISIBILITY_SELECT_BUTTON_SELECTOR)];
  for (const pattern of UI.visibilityButtons) {
    candidates.push(page.getByRole('button', { name: pattern }));
    candidates.push(page.getByRole('link', { name: pattern }));
  }

  return candidates;
}

/**
 * 비디오 편집 화면의 공개 상태 카드가 렌더링될 때까지 기다린다.
 * Studio shell만 뜬 상태에서 다음 단계로 넘어가지 않게 막을 때 사용한다.
 */
async function waitForVisibilityCard(page, logger) {
  const candidates = buildVisibilityCardCandidates(page);

  for (let attempt = 0; attempt < VISIBILITY_CARD_APPEAR_ATTEMPTS; attempt += 1) {
    await assertStudioAuthenticated(page);
    const visible = await firstVisible(candidates);
    if (visible) {
      logger.info('Visibility card is ready');
      return visible;
    }

    if (attempt === VISIBILITY_CARD_APPEAR_ATTEMPTS - 1) {
      break;
    }

    await wait(LOCATOR_RETRY_INTERVAL_MS);
  }

  throw new Error('Could not find visibility card in video editor');
}

/**
 * 실패 분석용 screenshot과 HTML을 저장한다.
 * 비디오별 자동화 실패 시점의 화면 상태를 디버깅 가능하게 남길 때 사용한다.
 */
async function saveArtifacts({ page, jobId, videoId, prefix }) {
  const dir = path.join(config.artifactsDir, jobId);
  await ensureDir(dir);

  const png = `${videoId}-${prefix}.png`;
  const html = `${videoId}-${prefix}.html`;
  await page.screenshot({ path: path.join(dir, png), fullPage: true }).catch(() => {});
  await fs.writeFile(path.join(dir, html), await page.content(), 'utf-8').catch(() => {});

  return [png, html];
}

/**
 * 현재 페이지가 Google 로그인 화면으로 이동했는지 확인한다.
 * 세션 만료를 빠르게 감지해서 재인증 플로우로 전환할 때 사용한다.
 */
async function assertStudioAuthenticated(page) {
  const currentUrl = page.url();
  if (!currentUrl.includes(GOOGLE_ACCOUNTS_HOST)) {
    return;
  }

  throw buildAuthenticationRequiredError('Google authentication is required again');
}

/**
 * 비디오 편집 화면의 가시성 패널 진입점을 연다.
 * 텍스트와 role이 locale마다 달라질 수 있어 여러 locator 후보를 순차 탐색한다.
 */
async function openVisibilityPanel(page, logger) {
  const candidates = buildVisibilityEntryCandidates(page);
  const button = await clickVisibleLocator(candidates);
  if (!button) {
    throw new Error('Could not open visibility section');
  }

  await page.waitForTimeout(LOCATOR_RETRY_INTERVAL_MS);
  logger.info('Opened visibility section');
}

/**
 * 비공개 공유 다이얼로그를 연다.
 * 공유 진입 버튼을 찾은 뒤 다이얼로그가 실제로 나타날 때까지 기다릴 때 사용한다.
 */
async function openShareDialog(page, logger) {
  const candidates = [];
  for (const p of UI.sharePrivatelyEntry) {
    candidates.push(page.getByRole('button', { name: p }));
    candidates.push(page.getByRole('link', { name: p }));
    candidates.push(page.getByText(p));
  }

  const trigger = await waitForVisibleLocator(candidates, {
    attempts: SHARE_DIALOG_TRIGGER_ATTEMPTS,
    intervalMs: LOCATOR_RETRY_INTERVAL_MS,
  });
  if (!trigger) {
    throw new Error('Could not find Share privately entry point');
  }

  await trigger.click();
  const dialog = await resolveShareDialog(page);
  logger.info('Opened share privately dialog');
  return dialog;
}

/**
 * 현재 페이지에서 비공개 공유 다이얼로그 본체를 찾는다.
 * title 기반 role 탐색이 실패하면 CSS locator를 fallback으로 사용한다.
 */
async function resolveShareDialog(page) {
  const candidates = [];
  for (const pattern of UI.shareDialogTitles) {
    candidates.push(page.getByRole('dialog', { name: pattern }));
  }

  candidates.push(page.locator('ytcp-private-video-sharing-dialog tp-yt-paper-dialog'));
  const dialog = await waitForVisibleLocator(candidates, {
    attempts: SHARE_DIALOG_APPEAR_ATTEMPTS,
    intervalMs: LOCATOR_RETRY_INTERVAL_MS,
  });
  if (dialog) {
    return dialog;
  }

  throw new Error('Could not find private share dialog');
}

/**
 * 초대 대상 이메일 입력창을 찾는다.
 * 접근성 label 우선 탐색 후 내부 input selector를 fallback으로 사용한다.
 */
async function resolveInviteeInput(dialog) {
  const candidates = [];
  for (const label of UI.inviteeInputLabels) {
    candidates.push(dialog.getByRole('textbox', { name: label }));
    candidates.push(dialog.getByLabel(label));
  }

  candidates.push(dialog.locator('ytcp-chip-bar input.text-input'));
  candidates.push(dialog.locator('input[aria-label="초대 대상자"]'));
  candidates.push(dialog.locator('input[type="email"]'));

  const input = await waitForVisibleLocator(candidates, {
    attempts: SHARE_DIALOG_APPEAR_ATTEMPTS,
    intervalMs: LOCATOR_RETRY_INTERVAL_MS,
  });
  if (input) {
    return input;
  }

  throw new Error('Could not find invitee input in share dialog');
}

/**
 * 비공개 공유 다이얼로그에 이메일 목록을 추가한다.
 * dry-run에서는 실제 입력 대신 예정된 추가 건수만 로그로 남긴다.
 */
async function addEmails({ dialog, emails, logger, dryRun }) {
  if (dryRun) {
    logger.info(`Dry run: would add ${emails.length} emails`);
    return;
  }

  const input = await resolveInviteeInput(dialog);

  for (const email of emails) {
    await input.fill(email);
    await input.press('Enter');
    logger.info(`Queued invite for ${maskEmail(email)}`);
  }
}

/**
 * 이메일 알림 발송 여부를 다이얼로그 상태에 맞게 조정한다.
 * 현재 체크 상태와 원하는 상태를 비교해 필요한 경우에만 토글한다.
 */
async function setNotifyEmail({ dialog, disableEmailNotification, logger, dryRun }) {
  if (dryRun) {
    logger.info(`Dry run: would set disableEmailNotification=${disableEmailNotification}`);
    return;
  }

  for (const label of UI.notifyCheckboxLabels) {
    const checkbox = dialog.getByRole('checkbox', { name: label }).first();
    if (await checkbox.isVisible().catch(() => false)) {
      const checked = await checkbox.isChecked().catch(() => null);
      const shouldBeChecked = !disableEmailNotification;
      if (checked !== shouldBeChecked) {
        await checkbox.click();
        logger.info(`Changed email notification option to ${shouldBeChecked}`);
      }
      return;
    }
  }

  logger.warn('Notification checkbox not found; skipped');
}

/**
 * 다이얼로그의 저장 또는 완료 버튼을 눌러 변경을 확정한다.
 * dry-run에서는 실제 저장을 생략하고 로그만 기록한다.
 */
async function commitSave({ dialog, dryRun, logger }) {
  if (dryRun) {
    logger.info('Dry run: skipped save action');
    return;
  }

  for (const pattern of UI.saveButtons) {
    const btn = dialog.getByRole('button', { name: pattern }).first();
    if (!(await btn.isVisible().catch(() => false))) {
      continue;
    }

    if (!(await btn.isEnabled().catch(() => false))) {
      continue;
    }

    await btn.click();
    logger.info('Saved sharing settings');
    return;
  }

  logger.warn('Could not find save/done button');
}

/**
 * 단일 비디오에 대한 비공개 공유 자동화를 수행한다.
 * 편집 화면 진입부터 공유 다이얼로그 저장까지 한 비디오 단위 흐름을 담당한다.
 */
async function processVideo({ page, payload, videoId }) {
  const { logger } = payload;
  const url = withStudioBrowserApproval(`${STUDIO_VIDEO_EDIT_URL}/${encodeURIComponent(videoId)}/edit`);
  logger.info(`Opening Studio page for video ${videoId}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
  await assertStudioAuthenticated(page);
  await waitForVisibilityCard(page, logger);
  await openVisibilityPanel(page, logger);

  let privateFound = false;
  for (const pattern of UI.privateIndicators) {
    if (await page.getByText(pattern).first().isVisible().catch(() => false)) {
      privateFound = true;
      break;
    }
  }

  if (!privateFound) {
    logger.warn('Private indicator not explicitly found, continuing cautiously');
    const shareDialog = await openShareDialog(page, logger);
    await addEmails({ dialog: shareDialog, emails: payload.emails, logger, dryRun: payload.dryRun });
    await setNotifyEmail({
      dialog: shareDialog,
      disableEmailNotification: payload.disableEmailNotification,
      logger,
      dryRun: payload.dryRun,
    });
    await commitSave({ dialog: shareDialog, dryRun: payload.dryRun, logger });
    return buildSuccessResult({ videoId, payload });
  }

  logger.info('Private visibility indicator found');
  const shareDialog = await openShareDialog(page, logger);
  await addEmails({ dialog: shareDialog, emails: payload.emails, logger, dryRun: payload.dryRun });
  await setNotifyEmail({
    dialog: shareDialog,
    disableEmailNotification: payload.disableEmailNotification,
    logger,
    dryRun: payload.dryRun,
  });
  await commitSave({ dialog: shareDialog, dryRun: payload.dryRun, logger });

  return buildSuccessResult({ videoId, payload });
}

/**
 * storageState 기반으로 YouTube Studio 비공개 공유 자동화를 수행한다.
 * job 큐 워커에서 비디오별 결과와 아티팩트를 수집할 때 사용한다.
 */
async function runYoutubeStudioShare(job, options) {
  const browser = await chromium.launch({ headless: config.playwrightHeadless });
  const context = await browser.newContext({
    storageState: options.storageStatePath,
    locale: options.locale === 'auto' ? undefined : options.locale,
  });
  const page = await context.newPage();

  const results = [];

  try {
    await page.goto(withStudioBrowserApproval(STUDIO_HOME_URL), {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_TIMEOUT_MS,
    });
    await assertStudioAuthenticated(page);
    job.addLog('info', 'Opened Studio home page');

    const payload = {
      emails: options.emailsToAdd,
      disableEmailNotification: options.disableEmailNotification,
      dryRun: options.dryRun,
      logger: {
        info: (message) => job.addLog('info', message),
        warn: (message) => job.addLog('warn', message),
      },
    };

    for (const videoId of options.videoIds) {
      try {
        const result = await processVideo({ page, payload, videoId });
        results.push(result);
      } catch (error) {
        if (error.code === 'AUTHENTICATION_REQUIRED') {
          throw error;
        }
        job.addLog('error', `[${videoId}] ${error.message}`);
        const files = await saveArtifacts({ page, jobId: job.jobId, videoId, prefix: 'error' });
        results.push({
          videoId,
          status: 'failed',
          addedCount: DEFAULT_ADDED_COUNT,
          message: error.message,
          artifacts: files.map((fileName) => ({
            fileName,
            url: `/api/jobs/${job.jobId}/artifacts/${fileName}`,
          })),
        });
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }

  return results;
}

module.exports = {
  runYoutubeStudioShare,
};
