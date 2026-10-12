/**
 * Builds the shareable guest/demo package:
 *   VITE_SHARE_BUILD=1 (no personal seed, personal mode starts empty with set-password flow)
 *   -> tmp/share-build/HealthTrend/{app,serve.py,启动-Mac.command,启动-Windows.bat,使用说明.txt}
 *   -> zip at SHARE_ZIP_PATH (default tmp/share-build/HealthTrend-share.zip)
 * Fails if the privacy scan finds personal markers before or after zipping.
 */
import { execFileSync } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { loadPrivacyMarkers, scanForPersonalData } from './sharePrivacy.ts';

const root = process.cwd();
const outRoot = resolve(root, 'tmp/share-build');
const pkg = join(outRoot, 'HealthTrend');
const app = join(pkg, 'app');
const zipPath = resolve(process.env.SHARE_ZIP_PATH ?? join(outRoot, 'HealthTrend-share.zip'));

await rm(outRoot, { recursive: true, force: true });
await mkdir(pkg, { recursive: true });
execFileSync('node', ['scripts/copy-ocr-assets.mjs'], { cwd: root, stdio: 'inherit' });
execFileSync('npx', ['vite', 'build', '--outDir', app, '--emptyOutDir'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, VITE_SHARE_BUILD: '1', VITE_BASE_PATH: './', HEALTH_BACKUP_DIR: '' },
});
// Vite copies public/ wholesale: drop the personal seed (gitignored real data).
await rm(join(app, 'seeds/personal-backup.json'), { force: true });
await rm(join(app, 'seeds/README.md'), { force: true });

const kit = join(root, 'scripts/share-kit');
for (const name of ['serve.py', '启动-Mac.command', '启动-Windows.bat', '使用说明.txt']) { // make_zip.py stays out of the package
  await copyFile(join(kit, name), join(pkg, name));
}
await chmod(join(pkg, '启动-Mac.command'), 0o755);
await chmod(join(pkg, 'serve.py'), 0o755);

const markers = await loadPrivacyMarkers(root);
const before = await scanForPersonalData(pkg, markers);
if (before.length) {
  console.error('Privacy scan FAILED (build):', before);
  process.exit(1);
}
if (await stat(join(app, 'seeds/demo-record.json')).catch(() => null) === null) throw new Error('demo seed missing');

await mkdir(dirname(zipPath), { recursive: true });
await rm(zipPath, { force: true });
execFileSync('python3', [join(root, 'scripts/share-kit/make_zip.py'), outRoot, 'HealthTrend', zipPath]);

const check = await mkdtemp(join(tmpdir(), 'share-zip-check-'));
execFileSync('unzip', ['-q', zipPath, '-d', check]);
const after = await scanForPersonalData(check, markers);
await rm(check, { recursive: true, force: true });
if (after.length) {
  console.error('Privacy scan FAILED (zip):', after);
  process.exit(1);
}
const size = (await stat(zipPath)).size;
console.info(`Share zip OK: ${zipPath} (${(size / 1024 / 1024).toFixed(1)} MiB); ${markers.length} markers; 0 findings (build + extracted zip).`);
