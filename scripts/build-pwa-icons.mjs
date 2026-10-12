import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
mkdirSync('public/icons', { recursive: true });
const svg = readFileSync('build/icon.svg', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
await page.setContent(`<html><body style="margin:0;background:#fff">${svg}</body></html>`);
await page.screenshot({ path: 'tmp/pwa-1024.png', clip: { x: 0, y: 0, width: 1024, height: 1024 } });
await browser.close();
for (const size of [180, 192, 512]) {
  execFileSync('sips', ['-z', String(size), String(size), 'tmp/pwa-1024.png', '--out', `public/icons/icon-${size}.png`], { stdio: 'ignore' });
}
console.info('PWA icons ready');
