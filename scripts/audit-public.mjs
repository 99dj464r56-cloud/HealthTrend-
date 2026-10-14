import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { auditPublicArtifact } from './publicArtifact.mjs';

const root = process.cwd();
const fail = (message) => { throw new Error(`Public release audit failed: ${message}`); };
const expectedBase = process.env.VITE_BASE_PATH ?? '/';

const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
  .split('\n').filter(Boolean);
const forbiddenMedia = /\.(?:pdf|jpe?g|png|webp|heic|tiff?)$/i;
const allowedMedia = /^(?:public\/icons\/|docs\/screenshots\/|build\/icon\.svg$)/;
const forbiddenPaths = tracked.filter((path) => forbiddenMedia.test(path) && !allowedMedia.test(path));
if (forbiddenPaths.length) fail(`source reports or personal media are included: ${forbiddenPaths.join(', ')}`);

const sourceExtensions = new Set(['.md', '.ts', '.tsx', '.json', '.html', '.css', '.yml', '.yaml', '.mjs']);
for (const path of tracked.filter((file) => sourceExtensions.has(extname(file)))) {
  const text = await readFile(resolve(root, path), 'utf8');
  if (/\/Users\/[^/\s]+|Mobile Documents\/|Photos Library\.photoslibrary/i.test(text)) {
    fail(`a local home or photo-library path appears in ${path}`);
  }
}

const dist = resolve(root, 'dist');
const committedDemo = execFileSync('git', ['show', 'HEAD:public/seeds/demo-record.json'], { cwd: root });
const inventory = await auditPublicArtifact(dist, committedDemo);
const index = await readFile(join(dist, 'index.html'), 'utf8');
if (!index.includes('HealthTrend')) fail('built app shell is missing its title.');
if (!index.includes(`${expectedBase}assets/`)) fail(`built app shell does not use configured base path ${expectedBase}.`);
if (/\b(?:src|href)=["']https?:\/\//i.test(index)) fail('built HTML contains a remote script or stylesheet.');

const requiredAssets = [
  'ocr/worker.min.js',
  'ocr/core/tesseract-core-simd-lstm.wasm.js',
  'ocr/core/tesseract-core-simd-lstm.wasm',
  'ocr/lang/chi_sim.traineddata.gz',
  'ocr/lang/eng.traineddata.gz',
];
let totalOcrBytes = 0;
for (const asset of requiredAssets) {
  const file = join(dist, asset);
  const info = await stat(file).catch(() => null);
  if (!info?.isFile() || info.size < 1) fail(`missing same-origin runtime asset ${asset}.`);
  totalOcrBytes += info.size;
}
if (totalOcrBytes > 100 * 1024 * 1024) fail('OCR runtime unexpectedly exceeds 100 MB.');

const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
for (const name of ['pdfjs-dist', 'tesseract.js', '@tesseract.js-data/eng', '@tesseract.js-data/chi_sim']) {
  if (!lock.packages?.[`node_modules/${name}`]?.version) fail(`dependency ${name} is not locked.`);
}
const expectedLicenses = new Map([
  ['pdfjs-dist', 'Apache-2.0'],
  ['tesseract.js', 'Apache-2.0'],
  ['tesseract.js-core', 'Apache-2.0'],
  ['@tesseract.js-data/eng', 'MIT'],
  ['@tesseract.js-data/chi_sim', 'MIT'],
]);
for (const [name, license] of expectedLicenses) {
  const metadata = JSON.parse(await readFile(join(root, 'node_modules', name, 'package.json'), 'utf8'));
  if (metadata.license !== license) fail(`license inventory changed for ${name}; expected ${license}, found ${metadata.license}.`);
}

console.info(`Public audit passed: ${inventory.length} inventoried output files; ${tracked.length} source files; ${requiredAssets.length} same-origin OCR assets (${(totalOcrBytes / 1024 / 1024).toFixed(1)} MiB); base ${expectedBase}.`);
