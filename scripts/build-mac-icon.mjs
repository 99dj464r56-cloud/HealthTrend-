// Renders build/icon.svg -> build/icon.icns (macOS iconutil + sips).
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
const svg = readFileSync('build/icon.svg', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
await page.screenshot({ path: 'build/icon-1024.png', omitBackground: true, clip: { x: 0, y: 0, width: 1024, height: 1024 } });
await browser.close();
const set = 'build/icon.iconset';
rmSync(set, { recursive: true, force: true });
mkdirSync(set);
for (const s of [16, 32, 128, 256, 512]) {
  execFileSync('sips', ['-z', String(s), String(s), 'build/icon-1024.png', '--out', `${set}/icon_${s}x${s}.png`], { stdio: 'ignore' });
  execFileSync('sips', ['-z', String(s * 2), String(s * 2), 'build/icon-1024.png', '--out', `${set}/icon_${s}x${s}@2x.png`], { stdio: 'ignore' });
}
execFileSync('iconutil', ['-c', 'icns', set, '-o', 'build/icon.icns']);
rmSync(set, { recursive: true, force: true });
console.info('build/icon.icns ready');
