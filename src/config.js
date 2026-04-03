const path = require('path');

function toBoolean(value, defaultValue = true) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  return String(value).toLowerCase() === 'true';
}

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_GOOGLE_SIGNIN_URL = 'https://accounts.google.com/signin/v2/identifier?service=youtube';

const config = {
  rootDir: ROOT_DIR,
  serviceName: 'youtube-private-share-server',
  version: '1.0.0',
  port: Number(process.env.PORT || 3000),
  adminToken: process.env.ADMIN_TOKEN || '',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  storageStatesDir: path.resolve(ROOT_DIR, process.env.STORAGE_STATES_DIR || './data/storageStates'),
  connectionsDir: path.resolve(ROOT_DIR, process.env.CONNECTIONS_DIR || './data/connections'),
  loginSessionsDir: path.resolve(ROOT_DIR, process.env.LOGIN_SESSIONS_DIR || './data/loginSessions'),
  artifactsDir: path.resolve(ROOT_DIR, process.env.ARTIFACTS_DIR || './data/artifacts'),
  jobsDir: path.resolve(ROOT_DIR, process.env.JOBS_DIR || './data/jobs'),
  tmpDir: path.resolve(ROOT_DIR, process.env.TMP_DIR || './data/tmp'),
  playwrightHeadless: toBoolean(process.env.PLAYWRIGHT_HEADLESS, true),
  defaultLocale: process.env.DEFAULT_LOCALE || 'auto',
  jobHistoryLimit: Number(process.env.JOB_HISTORY_LIMIT || 100),
  jobPollIntervalMs: Number(process.env.JOB_POLL_INTERVAL_MS || 500),
  loginSessionTtlMs: Number(process.env.LOGIN_SESSION_TTL_MS || 15 * 60 * 1000),
  googleSigninUrl: process.env.GOOGLE_SIGNIN_URL || DEFAULT_GOOGLE_SIGNIN_URL,
};

module.exports = config;
