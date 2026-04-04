require('dotenv').config();
const os = require('os');
const path = require('path');
const fs = require('fs/promises');
const net = require('net');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const config = require('../src/config');
const { ensureDir } = require('../src/utils/fs');
const connectionService = require('../src/services/connectionService');
const loginSessionService = require('../src/services/loginSessionService');

const TEMP_PROFILE_PREFIX = 'yt-private-share-login-';
const DEFAULT_PROFILE_DIRECTORY = 'Default';
const LOCALHOST = '127.0.0.1';
const LOGIN_COMPLETE_TIMEOUT_MS = 15 * 60 * 1000;
const BROWSER_START_TIMEOUT_MS = 15 * 1000;
const BROWSER_CLOSE_TIMEOUT_MS = 5 * 1000;
const CDP_CONNECT_RETRY_INTERVAL_MS = 250;
const LOGIN_READY_URL_PATTERN = /accounts\.google\.com|studio\.youtube\.com/;
const STUDIO_READY_URL_PATTERN = /studio\.youtube\.com/;
const GOOGLE_CHROME_MAC_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const GOOGLE_CHROME_LINUX_PATHS = [
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/snap/bin/chromium',
];
const GOOGLE_CHROME_WINDOWS_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

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

/**
 * 로그인 브라우저의 실제 실행 파일 경로를 결정한다.
 */
async function resolveLoginBrowserExecutablePath() {
  const configuredExecutablePath = process.env.PLAYWRIGHT_LOGIN_BROWSER_PATH?.trim();
  if (configuredExecutablePath) {
    await fs.access(configuredExecutablePath);
    return configuredExecutablePath;
  }

  const executableCandidates = resolveLoginBrowserExecutableCandidates();
  for (const executableCandidate of executableCandidates) {
    try {
      await fs.access(executableCandidate);
      return executableCandidate;
    } catch (error) {
      continue;
    }
  }

  throw new Error('Google Chrome executable was not found. Set PLAYWRIGHT_LOGIN_BROWSER_PATH to your Chrome binary path.');
}

function resolveLoginBrowserExecutableCandidates() {
  if (process.platform === 'darwin') {
    return [GOOGLE_CHROME_MAC_PATH];
  }

  if (process.platform === 'win32') {
    return GOOGLE_CHROME_WINDOWS_PATHS;
  }

  return GOOGLE_CHROME_LINUX_PATHS;
}

function buildInteractiveLoginOptions({ debuggingPort, executablePath, userDataDir }) {
  const profileDirectory = process.env.PLAYWRIGHT_LOGIN_PROFILE_DIRECTORY?.trim() || DEFAULT_PROFILE_DIRECTORY;
  const launchArgs = [
    `--remote-debugging-port=${debuggingPort}`,
    `--user-data-dir=${userDataDir}`,
    `--profile-directory=${profileDirectory}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--new-window',
  ];

  return {
    executablePath,
    debuggingPort,
    args: launchArgs,
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
 * 자동화 플래그를 최소화한 실제 Chrome 프로세스를 실행한다.
 */
function launchLoginBrowser(loginOptions) {
  return spawn(loginOptions.executablePath, loginOptions.args, {
    stdio: 'ignore',
  });
}

/**
 * 원격 디버깅용 빈 포트를 할당한다.
 */
async function allocateDebuggingPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once('error', reject);
    server.listen(0, LOCALHOST, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => {
          reject(new Error('Could not resolve a local debugging port'));
        });
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(address.port);
      });
    });
  });
}

/**
 * 외부에서 띄운 Chrome에 CDP로 연결한다.
 */
async function connectToLoginBrowser({ debuggingPort, browserProcess }) {
  const endpointURL = `http://${LOCALHOST}:${debuggingPort}`;
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < BROWSER_START_TIMEOUT_MS) {
    if (browserProcess.exitCode !== null) {
      throw new Error(`Chrome exited before it was ready. exitCode=${browserProcess.exitCode}`);
    }

    try {
      return await chromium.connectOverCDP(endpointURL);
    } catch (error) {
      lastError = error;
      await wait(CDP_CONNECT_RETRY_INTERVAL_MS);
    }
  }

  const detail = lastError?.message || 'Unknown error';
  throw new Error(`Could not connect to Chrome DevTools endpoint: ${detail}`);
}

/**
 * connectOverCDP로 연결된 브라우저의 기본 context를 반환한다.
 */
function resolvePersistentContext(browser) {
  const defaultContext = browser.contexts()[0];
  if (defaultContext) {
    return defaultContext;
  }

  throw new Error('Chrome default browser context was not available');
}

/**
 * 짧은 재시도 대기를 위한 sleep.
 */
function wait(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

/**
 * 수동 로그인 브라우저와 임시 프로필을 정리한다.
 */
async function cleanupLoginResources({ browser, browserProcess, userDataDir }) {
  await closeBrowserConnection(browser);
  await stopLoginBrowserProcess(browserProcess);
  if (!userDataDir) {
    return;
  }

  await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
}

async function closeBrowserConnection(browser) {
  if (!browser) {
    return;
  }

  await browser.close().catch(() => {});
}

async function stopLoginBrowserProcess(browserProcess) {
  if (!browserProcess) {
    return;
  }

  if (browserProcess.exitCode !== null) {
    return;
  }

  browserProcess.kill('SIGTERM');
  await waitForBrowserProcessExit(browserProcess).catch(() => {});

  if (browserProcess.exitCode !== null) {
    return;
  }

  browserProcess.kill('SIGKILL');
  await waitForBrowserProcessExit(browserProcess).catch(() => {});
}

function waitForBrowserProcessExit(browserProcess) {
  return new Promise((resolve, reject) => {
    if (browserProcess.exitCode !== null) {
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Chrome process did not exit in time'));
    }, BROWSER_CLOSE_TIMEOUT_MS);

    const handleExit = () => {
      cleanup();
      resolve();
    };

    const handleError = (error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      browserProcess.off('exit', handleExit);
      browserProcess.off('error', handleError);
    };

    browserProcess.once('exit', handleExit);
    browserProcess.once('error', handleError);
  });
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
  let browser = null;
  let browserProcess = null;
  let userDataDir = null;

  if (parsedArgs.isAgentMode) {
    const resolvedContext = await resolveAgentLoginContext(loginSessionId);
    connectionId = resolvedContext.connectionId;
    userId = resolvedContext.userId;
  }

  const outputPath = connectionService.buildStorageStatePath(connectionId);
  await ensureDir(path.dirname(outputPath));
  try {
    userDataDir = await resolveUserDataDir();
    const executablePath = await resolveLoginBrowserExecutablePath();
    const debuggingPort = await allocateDebuggingPort();
    const launchOptions = buildInteractiveLoginOptions({
      debuggingPort,
      executablePath,
      userDataDir,
    });
    browserProcess = launchLoginBrowser(launchOptions);
    browser = await connectToLoginBrowser({
      debuggingPort,
      browserProcess,
    });
    const context = resolvePersistentContext(browser);
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
      process.exitCode = 1;
      return;
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
      process.exitCode = 1;
      return;
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
      process.exitCode = 0;
      return;
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
      process.exitCode = 1;
      return;
    }
  } catch (error) {
    console.error('Failed to start interactive login browser:', error.message);
    await finalizeLoginSession({
      loginSessionId,
      onComplete: async (targetLoginSessionId) => {
        await loginSessionService.failLoginSession({
          loginSessionId: targetLoginSessionId,
          userId,
        }).catch(() => {});
      },
    });
    process.exitCode = 1;
    return;
  } finally {
    await cleanupLoginResources({
      browser,
      browserProcess,
      userDataDir,
    });
  }
})();
