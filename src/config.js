const path = require('path');

function toBoolean(value, defaultValue = true) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  return String(value).toLowerCase() === 'true';
}

const ROOT_DIR = path.resolve(__dirname, '..');

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
  storageStatePath: path.resolve(ROOT_DIR, process.env.STORAGE_STATE_PATH || './data/storageState/storageState.json'),
  artifactsDir: path.resolve(ROOT_DIR, process.env.ARTIFACTS_DIR || './data/artifacts'),
  jobsDir: path.resolve(ROOT_DIR, process.env.JOBS_DIR || './data/jobs'),
  tmpDir: path.resolve(ROOT_DIR, process.env.TMP_DIR || './data/tmp'),
  playwrightHeadless: toBoolean(process.env.PLAYWRIGHT_HEADLESS, true),
  defaultLocale: process.env.DEFAULT_LOCALE || 'auto',
  jobHistoryLimit: Number(process.env.JOB_HISTORY_LIMIT || 100),
  jobPollIntervalMs: Number(process.env.JOB_POLL_INTERVAL_MS || 500),
};

module.exports = config;
