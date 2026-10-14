'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const roots = ['assets/sprites/buildings', 'assets/tiles'];
function pngFiles(directory) {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const relative = path.posix.join(directory, entry.name);
    return entry.isDirectory() ? pngFiles(relative) : entry.isFile() && entry.name.endsWith('.png') ? [relative] : [];
  });
}

(async () => {
  const files = roots.flatMap(pngFiles);
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  try {
    const page = await browser.newPage();
    for (const relative of files) {
      const input = fs.readFileSync(path.join(root, relative)).toString('base64');
      const output = await page.evaluate(async base64 => {
        const image = new Image();
        await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = 'data:image/png;base64,' + base64; });
        const canvas = document.createElement('canvas');canvas.width = canvas.height = 64;
        const context = canvas.getContext('2d');context.imageSmoothingEnabled = false;context.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight, 0, 0, 64, 64);
        const pixels = context.getImageData(0, 0, 64, 64);
        for (let index = 3; index < pixels.data.length; index += 4) pixels.data[index] = pixels.data[index] < 128 ? 0 : 255;
        context.putImageData(pixels, 0, 0);
        return canvas.toDataURL('image/png').split(',')[1];
      }, input);
      fs.writeFileSync(path.join(root, relative), Buffer.from(output, 'base64'));
    }
    console.log(`Resized ${files.length} PNG art assets to 64x64.`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
