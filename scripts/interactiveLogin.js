require('dotenv').config();
const os = require('os');
const path = require('path');
const fs = require('fs/promises');
const { chromium } = require('playwright');
const config = require('../src/config');
const { ensureDir } = require('../src/utils/fs');
const connectionService = require('../src/services/connectionService');
const loginSessionService = require('../src/services/loginSessionService');

const DEFAULT_LOGIN_CHANNEL = 'chrome';
const LOGIN_IGNORE_DEFAULT_ARGS = ['--enable-automation'];
const TEMP_PROFILE_PREFIX = 'yt-private-share-login-';
const DEFAULT_PROFILE_DIRECTORY = 'Default';
const DEFAULT_LOGIN_CHROMIUM_SANDBOX = true;
const LOGIN_COMPLETE_TIMEOUT_MS = 15 * 60 * 1000;
const LOGIN_READY_URL_PATTERN = /accounts\.google\.com|studio\.youtube\.com/;
const STUDIO_READY_URL_PATTERN = /studio\.youtube\.com/;

/**
 * interactive login에서 사용할 Chrome 프로필 경로를 결정한다.
 */
async function resolveUserDataDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), TEMP_PROFILE_PREFIX));
}

/**
 * 스크립트 인자를 해석한다.
 */
function parseScriptArgs() {
  const agentLoginSessionFlagIndex = process.argv.indexOf('--agent-login-session-id');
  if (agentLoginSessionFlagIndex >= 0) {
    const loginSessionId = String(process.argv[agentLoginSessionFlagIndex + 1] || '').trim();
    if (!loginSessionId) {
      console.error('Usage: node scripts/interactiveLogin.js --agent-login-session-id <loginSessionId>');
      process.exit(1);
    }

    return {
      connectionId: null,
      loginSessionId,
      userId: null,
      isAgentMode: true,
    };
  }

  const connectionId = String(process.argv[2] || '').trim();
  if (connectionId) {
    const loginSessionFlagIndex = process.argv.indexOf('--login-session-id');
    const userIdFlagIndex = process.argv.indexOf('--user-id');
    const loginSessionId = loginSessionFlagIndex >= 0
      ? String(process.argv[loginSessionFlagIndex + 1] || '').trim() || null
      : null;
    const userId = userIdFlagIndex >= 0
      ? String(process.argv[userIdFlagIndex + 1] || '').trim() || 'admin'
      : 'admin';

    return {
      connectionId,
      loginSessionId,
      userId,
      isAgentMode: false,
    };
  }

  console.error('Usage: npm run interactive-login -- <connectionId>');
  process.exit(1);
}

function buildInteractiveLoginOptions(userDataDir) {
  const configuredChannel = process.env.PLAYWRIGHT_LOGIN_CHANNEL?.trim();
  const channel = configuredChannel || DEFAULT_LOGIN_CHANNEL;
  const profileDirectory = process.env.PLAYWRIGHT_LOGIN_PROFILE_DIRECTORY?.trim() || DEFAULT_PROFILE_DIRECTORY;
  const chromiumSandbox = DEFAULT_LOGIN_CHROMIUM_SANDBOX;
  const launchArgs = [`--profile-directory=${profileDirectory}`];

  return {
    headless: false,
    channel,
    userDataDir,
    chromiumSandbox,
    args: launchArgs,
    ignoreDefaultArgs: LOGIN_IGNORE_DEFAULT_ARGS,
  };
}

/**
 * persistent context에서 사용할 페이지를 반환합니다.
 * 기존 첫 탭을 우선 재사용하고 없으면 새 탭을 만듭니다.
 */
async function resolveLoginPage(context) {
  const existingPage = context.pages()[0];
  if (existingPage) {
    return existingPage;
  }

  return context.newPage();
}

/**
 * 로그인 완료 후 Studio 진입까지 대기한다.
 */
async function waitForAuthenticatedStudio(page) {
  await page.waitForURL(LOGIN_READY_URL_PATTERN, { timeout: 30000 });
  await page.waitForURL(STUDIO_READY_URL_PATTERN, { timeout: LOGIN_COMPLETE_TIMEOUT_MS });
}

/**
 * 로그인 세션 종료 상태를 기록한다.
 */
async function finalizeLoginSession({ loginSessionId, onComplete }) {
  if (!loginSessionId) {
    return;
  }

  await onComplete(loginSessionId);
}

/**
 * agent 모드에서는 loginSession으로부터 connection과 user를 복원한다.
 */
async function resolveAgentLoginContext(loginSessionId) {
  const loginSession = await loginSessionService.getLoginSessionForAgentOrThrow(loginSessionId);
  return {
    connectionId: loginSession.connectionId,
    userId: loginSession.userId,
  };
}

(async () => {
  const parsedArgs = parseScriptArgs();
  let { connectionId, loginSessionId, userId } = parsedArgs;

  if (parsedArgs.isAgentMode) {
    const resolvedContext = await resolveAgentLoginContext(loginSessionId);
    connectionId = resolvedContext.connectionId;
    userId = resolvedContext.userId;
  }

  const outputPath = connectionService.buildStorageStatePath(connectionId);
  await ensureDir(path.dirname(outputPath));
  const userDataDir = await resolveUserDataDir();

  const launchOptions = buildInteractiveLoginOptions(userDataDir);
  const context = await chromium.launchPersistentContext(userDataDir, launchOptions);
  const page = await resolveLoginPage(context);

  console.log('Opening YouTube Studio login page...');
  await page.bringToFront();
  try {
    await page.goto(config.googleSigninUrl, { waitUntil: 'domcontentloaded' });
  } catch (error) {
    console.error('Failed to open Google sign-in page:', error.message);
    await finalizeLoginSession({
      loginSessionId,
      onComplete: async (targetLoginSessionId) => {
        await loginSessionService.failLoginSession({
          loginSessionId: targetLoginSessionId,
          userId,
        }).catch(() => {});
      },
    });
    await context.close();
    process.exit(1);
  }

  try {
    await waitForAuthenticatedStudio(page);
  } catch (error) {
    console.error('Google sign-in did not complete as expected:', error.message);
    await finalizeLoginSession({
      loginSessionId,
      onComplete: async (targetLoginSessionId) => {
        await loginSessionService.expireLoginSession({
          loginSessionId: targetLoginSessionId,
          userId,
        }).catch(() => {});
      },
    });
    await context.close();
    process.exit(1);
  }

  try {
    await context.storageState({ path: outputPath });
    await connectionService.markAuthenticated({ connectionId, userId }).catch(() => {});
    await finalizeLoginSession({
      loginSessionId,
      onComplete: async (targetLoginSessionId) => {
        await loginSessionService.completeLoginSession({
          loginSessionId: targetLoginSessionId,
          userId,
        }).catch(() => {});
      },
    });
    console.log(`Saved storage state to: ${outputPath}`);
  } catch (error) {
    console.error('Failed to save storage state:', error.message);
    await finalizeLoginSession({
      loginSessionId,
      onComplete: async (targetLoginSessionId) => {
        await loginSessionService.failLoginSession({
          loginSessionId: targetLoginSessionId,
          userId,
        }).catch(() => {});
      },
    });
    await context.close();
    process.exit(1);
  }

  await context.close();
  process.exit(0);
})();
