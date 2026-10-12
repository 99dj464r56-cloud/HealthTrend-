import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Runs only when the packaged app exists (npm run build:mac). Uses temp userData + temp backup dir only.
const APP_BIN = resolve('tmp/mac-build/out/HealthTrend-darwin-arm64/HealthTrend.app/Contents/MacOS/HealthTrend');
const PASSWORD = 'desktop-e2e-Passw0rd';
const PROFILE = 'Desktop E2E Profile';

test.skip(!existsSync(APP_BIN), 'HealthTrend.app not built');
test.describe.configure({ mode: 'serial' });

const backupDir = mkdtempSync(join(tmpdir(), 'healthtrend-e2e-backup-'));

/** After setup/restore the Mac may show the Touch ID offer; skip it (OS prompt can't be automated). */
async function skipTouchIdOffer(win: Page): Promise<void> {
  const offer = win.getByRole('button', { name: /暂不启用/ });
  const workspace = win.getByRole('heading', { name: '健康记录' });
  await expect(offer.or(workspace)).toBeVisible({ timeout: 20_000 });
  if (await offer.isVisible()) await offer.click();
  await expect(workspace).toBeVisible();
}

async function launch(): Promise<{ app: ElectronApplication; win: Page }> {
  const userData = mkdtempSync(join(tmpdir(), 'healthtrend-e2e-profile-'));
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ backupDir }));
  const app = await electron.launch({ executablePath: APP_BIN, env: { ...process.env, HEALTHTREND_USER_DATA: userData } });
  const win = await app.firstWindow();
  return { app, win };
}

test('desktop app: three modes, set password, native encrypted backup', async () => {
  const { app, win } = await launch();
  await expect(win).toHaveTitle('HealthTrend');
  await expect(win.getByRole('button', { name: '进入访客模式' })).toBeVisible();
  await expect(win.getByRole('button', { name: '查看示范' })).toBeVisible();
  await win.getByRole('button', { name: '进入我的档案' }).click();
  await expect(win.getByRole('heading', { name: '设置恢复密码' })).toBeVisible();
  await expect(win.getByText('忘记密码将无法恢复加密备份').first()).toBeVisible();
  await win.getByLabel(/恢复密码（至少/).fill(PASSWORD);
  await win.getByLabel(/再次输入恢复密码/).fill(PASSWORD);
  await win.getByRole('button', { name: '设置恢复密码并加密' }).click();
  await skipTouchIdOffer(win);
  await win.getByLabel('档案显示名').fill(PROFILE);
  await win.getByLabel('我确认以上显示名对应该档案所属人').check();
  await win.getByRole('button', { name: '保存档案身份' }).click();
  await expect(win.locator('[data-backup-status]')).toContainText('已备份到', { timeout: 15_000 });
  const text = readFileSync(join(backupDir, 'health-trend-personal.enc.json'), 'utf8');
  expect(text).not.toContain(PROFILE);
  expect(JSON.parse(text)).toMatchObject({ format: 'health-trend-personal-enc', version: 2 });

  // Native bridge refuses plaintext writes.
  const rejected = await win.evaluate(async () => {
    try { await (window as unknown as { healthTrendNative: { writeBackup(t: string): Promise<unknown> } }).healthTrendNative.writeBackup('{"profile":{"displayName":"x"}}'); return false; } catch { return true; }
  });
  expect(rejected).toBe(true);

  await win.goto('app://healthtrend/?mode=demo');
  await expect(win.getByText('示范数据 · 非真实病历').first()).toBeVisible();
  await app.close();
});

test('desktop app: fresh install auto-offers iCloud restore and decrypts with the password', async () => {
  const { app, win } = await launch();
  await win.getByRole('button', { name: '进入我的档案' }).click();
  await expect(win.getByRole('heading', { name: '恢复加密备份' })).toBeVisible();
  await win.getByLabel('备份密码').fill(PASSWORD);
  await win.getByRole('button', { name: '解密并恢复' }).click();
  await skipTouchIdOffer(win);
  await expect(win.getByLabel('档案显示名')).toHaveValue(PROFILE);
  await app.close();
});
