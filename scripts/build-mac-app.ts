/**
 * Builds HealthTrend.app (Electron, arm64 on Apple Silicon) with the web app + OCR assets bundled.
 *   node scripts/build-mac-app.ts            -> tmp/mac-build/out/HealthTrend-darwin-<arch>/HealthTrend.app
 *   MAC_ZIP_PATH=/path/HealthTrend-mac.zip   -> also writes a share zip (privacy-scanned before + after)
 * The bundle never contains the personal seed or any personal path (backup folder is chosen at runtime).
 */
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { packager } from '@electron/packager';
import { loadPrivacyMarkers, scanForPersonalData } from './sharePrivacy.ts';

const root = process.cwd();
const arch = (process.env.MAC_ARCH ?? process.arch) as 'arm64' | 'x64' | 'universal';
const work = resolve(root, 'tmp/mac-build');
const stage = join(work, 'stage');
const outDir = join(work, 'out');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as { version: string; devDependencies: Record<string, string> };
const electronVersion = JSON.parse(await readFile(join(root, 'node_modules/electron/package.json'), 'utf8')).version as string;

await rm(work, { recursive: true, force: true });
await mkdir(stage, { recursive: true });

execFileSync('node', ['scripts/copy-ocr-assets.mjs'], { cwd: root, stdio: 'inherit' });
execFileSync('npx', ['vite', 'build', '--outDir', join(stage, 'web'), '--emptyOutDir'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, VITE_SHARE_BUILD: '1', VITE_DESKTOP_APP: '1', VITE_BASE_PATH: '/', HEALTH_BACKUP_DIR: '' },
});
await rm(join(stage, 'web/seeds/personal-backup.json'), { force: true });
await rm(join(stage, 'web/seeds/README.md'), { force: true });
await cp(join(root, 'electron'), join(stage, 'electron'), { recursive: true });
// Native Touch ID helper must stay outside asar (spawnable Mach-O).
await mkdir(join(stage, 'native-bin'), { recursive: true });
if (arch !== process.arch) throw new Error('Native helper packaging currently requires MAC_ARCH to match the build host.');
await rm(join(stage, 'electron/native/keychain-touchid'), { force: true });
execFileSync('swiftc', [join(root, 'electron/native/keychain-touchid.swift'), '-o', join(stage, 'native-bin/keychain-touchid')], { stdio: 'inherit' });

await writeFile(join(stage, 'package.json'), JSON.stringify({
  name: 'healthtrend',
  productName: 'HealthTrend',
  version: pkg.version,
  main: 'electron/main.cjs',
  private: true,
  author: "vimi",
}, null, 2));

if (!(await stat(join(root, 'build/icon.icns')).catch(() => null))) execFileSync('node', ['scripts/build-mac-icon.mjs'], { cwd: root, stdio: 'inherit' });

const [appDir] = await packager({
  dir: stage,
  out: outDir,
  name: 'HealthTrend',
  executableName: 'HealthTrend',
  platform: 'darwin',
  arch,
  electronVersion,
  electronZipDir: process.env.ELECTRON_ZIP_DIR ?? join(root, 'tmp/electron-dl'),
  icon: join(root, 'build/icon.icns'),
  appBundleId: 'local.healthtrend.app',
  appCategoryType: 'public.app-category.medical',
  appVersion: pkg.version,
  appCopyright: "© 2026 vimi",
  asar: true,
  extraResource: [join(stage, 'native-bin/keychain-touchid')],
  overwrite: true,
  prune: false,
  extendInfo: { NSHumanReadableCopyright: 'HealthTrend · 本机健康趋势（个人记录整理，不构成医疗建议）' },
});
const appPath = join(appDir!, 'HealthTrend.app');
// Ad-hoc sign: packaging edits Info.plist/resources, which invalidates the upstream Electron
// signature; Apple Silicon refuses to run binaries with broken signatures. No Developer ID needed.
execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });

const markers = await loadPrivacyMarkers(root);
// Scan our payload (web app, electron shell, asar) — the upstream Electron framework binary is excluded
// because it is the unmodified signed release and contains upstream build paths unrelated to the user.
const resources = join(appPath, 'Contents/Resources');
const findings = await scanForPersonalData(resources, markers);
const stageFindings = await scanForPersonalData(stage, markers);
if (findings.length || stageFindings.length) {
  console.error('Privacy scan FAILED:', [...findings, ...stageFindings]);
  process.exit(1);
}
console.info(`App OK: ${appPath} (${arch}, Electron ${electronVersion}); privacy scan 0 findings (${markers.length} markers).`);

if (process.env.MAC_ZIP_PATH) {
  const zipPath = resolve(process.env.MAC_ZIP_PATH);
  await rm(zipPath, { force: true });
  execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', appPath, zipPath]);
  const check = await mkdtemp(join(tmpdir(), 'mac-zip-check-'));
  execFileSync('ditto', ['-x', '-k', zipPath, check]);
  const after = await scanForPersonalData(join(check, 'HealthTrend.app/Contents/Resources'), markers);
  await rm(check, { recursive: true, force: true });
  if (after.length) {
    console.error('Privacy scan FAILED (zip):', after);
    process.exit(1);
  }
  const size = (await stat(zipPath)).size;
  console.info(`Mac zip OK: ${zipPath} (${(size / 1024 / 1024).toFixed(1)} MiB); 0 findings after extraction.`);
}
