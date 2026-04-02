const path = require('path');
const fs = require('fs/promises');
const { chromium } = require('playwright');
const config = require('../config');
const { ensureDir } = require('../utils/fs');

const UI = {
  visibilityButtons: [/visibility/i, /가시성|공개 상태|공개 설정/],
  privateIndicators: [/private/i, /비공개/],
  sharePrivatelyEntry: [/share privately/i, /비공개로 공유/],
  emailInputLabels: [/share with people/i, /사용자와 공유/, /email/i, /이메일/],
  notifyCheckboxLabels: [/notify via email/i, /이메일로 알림/],
  saveButtons: [/done/i, /save/i, /완료/, /저장/],
};
const STUDIO_HOME_URL = 'https://studio.youtube.com/';
const STUDIO_VIDEO_EDIT_URL = 'https://studio.youtube.com/video';
const PAGE_TIMEOUT_MS = 60000;
const PANEL_WAIT_MS = 1500;
const DRY_RUN_ADDED_COUNT = 0;
const DEFAULT_ADDED_COUNT = 0;

function buildSuccessResult({ videoId, payload }) {
  return {
    videoId,
    status: 'success',
    addedCount: payload.dryRun ? DRY_RUN_ADDED_COUNT : payload.emails.length,
    message: payload.dryRun ? 'Dry run completed' : 'Invites updated',
    artifacts: [],
  };
}

function maskEmail(email) {
  const [name, domain] = email.split('@');
  if (!domain) return '***';
  return `${name.slice(0, 2)}***@${domain}`;
}

async function firstVisible(locatorCandidates) {
  for (const locator of locatorCandidates) {
    if (await locator.first().isVisible().catch(() => false)) {
      return locator.first();
    }
  }
  return null;
}

async function saveArtifacts({ page, jobId, videoId, prefix }) {
  const dir = path.join(config.artifactsDir, jobId);
  await ensureDir(dir);

  const png = `${videoId}-${prefix}.png`;
  const html = `${videoId}-${prefix}.html`;
  await page.screenshot({ path: path.join(dir, png), fullPage: true }).catch(() => {});
  await fs.writeFile(path.join(dir, html), await page.content(), 'utf-8').catch(() => {});

  return [png, html];
}

async function openVisibilityPanel(page, logger) {
  const candidates = [];
  for (const pattern of UI.visibilityButtons) {
    candidates.push(page.getByRole('button', { name: pattern }));
    candidates.push(page.getByRole('link', { name: pattern }));
    candidates.push(page.getByText(pattern));
  }

  const button = await firstVisible(candidates);
  if (!button) {
    logger.warn('Visibility entry point not found; continuing');
    return;
  }

  await button.click().catch(() => {});
  logger.info('Opened visibility section');
}

async function openShareDialog(page, logger) {
  const candidates = [];
  for (const p of UI.sharePrivatelyEntry) {
    candidates.push(page.getByRole('button', { name: p }));
    candidates.push(page.getByRole('link', { name: p }));
    candidates.push(page.getByText(p));
  }

  const trigger = await firstVisible(candidates);
  if (!trigger) {
    throw new Error('Could not find Share privately entry point');
  }

  await trigger.click();
  logger.info('Opened share privately dialog');
}

async function addEmails({ page, emails, logger, dryRun }) {
  if (dryRun) {
    logger.info(`Dry run: would add ${emails.length} emails`);
    return;
  }

  let input = null;
  for (const label of UI.emailInputLabels) {
    const candidate = page.getByLabel(label).first();
    if (await candidate.isVisible().catch(() => false)) {
      input = candidate;
      break;
    }
  }

  if (!input) {
    input = page.locator('input[type="email"], input[aria-label*="mail" i]').first();
  }

  if (!(await input.isVisible().catch(() => false))) {
    throw new Error('Could not find email input in share dialog');
  }

  for (const email of emails) {
    await input.fill(email);
    await input.press('Enter');
    logger.info(`Queued invite for ${maskEmail(email)}`);
  }
}

async function setNotifyEmail({ page, disableEmailNotification, logger, dryRun }) {
  if (dryRun) {
    logger.info(`Dry run: would set disableEmailNotification=${disableEmailNotification}`);
    return;
  }

  for (const label of UI.notifyCheckboxLabels) {
    const checkbox = page.getByRole('checkbox', { name: label }).first();
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

async function commitSave({ page, dryRun, logger }) {
  if (dryRun) {
    logger.info('Dry run: skipped save action');
    return;
  }

  for (const pattern of UI.saveButtons) {
    const btn = page.getByRole('button', { name: pattern }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      logger.info('Saved sharing settings');
      return;
    }
  }

  logger.warn('Could not find save/done button');
}

async function processVideo({ page, payload, videoId }) {
  const { logger } = payload;
  const url = `${STUDIO_VIDEO_EDIT_URL}/${encodeURIComponent(videoId)}/edit`;
  logger.info(`Opening Studio page for video ${videoId}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });

  await page.waitForTimeout(PANEL_WAIT_MS);
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
    await openShareDialog(page, logger);
    await addEmails({ page, emails: payload.emails, logger, dryRun: payload.dryRun });
    await setNotifyEmail({
      page,
      disableEmailNotification: payload.disableEmailNotification,
      logger,
      dryRun: payload.dryRun,
    });
    await commitSave({ page, dryRun: payload.dryRun, logger });
    return buildSuccessResult({ videoId, payload });
  }

  logger.info('Private visibility indicator found');
  await openShareDialog(page, logger);
  await addEmails({ page, emails: payload.emails, logger, dryRun: payload.dryRun });
  await setNotifyEmail({
    page,
    disableEmailNotification: payload.disableEmailNotification,
    logger,
    dryRun: payload.dryRun,
  });
  await commitSave({ page, dryRun: payload.dryRun, logger });

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
    await page.goto(STUDIO_HOME_URL, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
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
