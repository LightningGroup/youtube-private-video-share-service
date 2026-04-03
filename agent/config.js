require('dotenv').config();
const path = require('path');

function toBoolean(value, defaultValue = true) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  return String(value).toLowerCase() === 'true';
}

const ROOT_DIR = path.resolve(__dirname, '..');

module.exports = {
  rootDir: ROOT_DIR,
  serverBaseUrl: String(process.env.AGENT_SERVER_BASE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  adminToken: process.env.ADMIN_TOKEN || '',
  agentId: process.env.AGENT_ID || 'local-agent',
  pollIntervalMs: Number(process.env.AGENT_POLL_INTERVAL_MS || 3000),
  runOnce: toBoolean(process.env.AGENT_RUN_ONCE, false),
};
