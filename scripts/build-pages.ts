/**
 * GitHub Pages build for https://99dj464r56-cloud.github.io/HealthTrend-/
 * Forces share-safe env: no personal seed, base path /HealthTrend-/.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve('.');
const out = join(root, 'dist');
const base = process.env.VITE_BASE_PATH ?? '/HealthTrend-/';

const types = spawnSync('npx', ['tsc', '--noEmit'], { cwd: root, stdio: 'inherit' });
if (types.status !== 0) process.exit(types.status ?? 1);

rmSync(out, { recursive: true, force: true });

const ocr = spawnSync('node', ['scripts/copy-ocr-assets.mjs'], { cwd: root, stdio: 'inherit' });
if (ocr.status !== 0) process.exit(ocr.status ?? 1);

const build = spawnSync('npx', ['vite', 'build'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, VITE_SHARE_BUILD: '1', VITE_BASE_PATH: base, HEALTH_BACKUP_DIR: '' },
});
if (build.status !== 0) process.exit(build.status ?? 1);

const personal = join(out, 'seeds', 'personal-backup.json');
if (existsSync(personal)) rmSync(personal, { force: true });
const readme = join(out, 'seeds', 'README.md');
if (existsSync(readme)) rmSync(readme, { force: true });

// SPA fallback for GitHub Pages (serves 404.html on deep links)
cpSync(join(out, 'index.html'), join(out, '404.html'));
writeFileSync(join(out, '.nojekyll'), '');
console.info(`Pages build ready at ${out} (base ${base})`);

// The existing Pages workflow invokes this entry point before uploading dist.
if (process.env.CI && process.env.CI !== 'false') {
  const browsers = spawnSync('npx', ['playwright', 'install', '--with-deps', 'chromium'], { cwd: root, stdio: 'inherit' });
  if (browsers.status !== 0) process.exit(browsers.status ?? 1);
  const tests = spawnSync('npm', ['run', 'test:e2e'], {
    cwd: root, stdio: 'inherit', env: { ...process.env, VITE_BASE_PATH: '/', VITE_SHARE_BUILD: '1' },
  });
  if (tests.status !== 0) process.exit(tests.status ?? 1);
}
