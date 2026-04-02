require('dotenv').config();
const path = require('path');
const { chromium } = require('playwright');
const config = require('../src/config');
const { ensureDir } = require('../src/utils/fs');

(async () => {
  const outputPath = config.storageStatePath;
  await ensureDir(path.dirname(outputPath));

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Opening YouTube Studio login page...');
  await page.goto('https://studio.youtube.com/', { waitUntil: 'domcontentloaded' });
  console.log('Please complete Google login manually in the opened browser.');
  console.log('After Studio dashboard is fully loaded, press Enter here to save session.');

  process.stdin.setEncoding('utf-8');
  process.stdin.once('data', async () => {
    await context.storageState({ path: outputPath });
    console.log(`Saved storage state to: ${outputPath}`);
    await browser.close();
    process.exit(0);
  });
})();
