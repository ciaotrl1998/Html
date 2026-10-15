'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
    await page.waitForFunction(() => window.GFArt && typeof GFArt.exportPngAssets === 'function');
    const assets = await page.evaluate(() => GFArt.exportPngAssets());
    for (const [relative, dataUrl] of Object.entries(assets)) {
      const target = path.join(root, relative), parent = path.dirname(target);
      fs.mkdirSync(parent, { recursive: true });
      fs.writeFileSync(target, Buffer.from(dataUrl.split(',')[1], 'base64'));
    }
    console.log(`Generated ${Object.keys(assets).length} PNG art assets.`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
