#!/usr/bin/env node
require('dotenv').config();
const config = require('./config');
const agentLoginService = require('./services/agentLoginService');
const agentRunner = require('./services/agentRunner');

function printUsage() {
  console.log('Usage: node agent/index.js claim-and-run');
  console.log('Usage: node agent/index.js login <loginSessionId>');
}

async function main() {
  const command = String(process.argv[2] || '').trim();
  if (command === 'login') {
    const loginSessionId = String(process.argv[3] || '').trim();
    if (!loginSessionId) {
      printUsage();
      process.exit(1);
    }

    await agentLoginService.run(loginSessionId);
    return;
  }

  if (command !== 'claim-and-run') {
    printUsage();
    process.exit(command ? 1 : 0);
  }

  if (!config.adminToken) {
    throw new Error('ADMIN_TOKEN is required for agent mode');
  }

  console.log(`[agent:${config.agentId}] connecting to ${config.serverBaseUrl}`);
  await agentRunner.runLoop();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  main,
};
