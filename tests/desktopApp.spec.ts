import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Runs only when the packaged app exists (npm run build:mac). Uses temp userData + temp backup dir only.
const APP_BIN = resolve('tmp/mac-build/out/HealthTrend-darwin-arm64/HealthTrend.app/Contents/MacOS/HealthTrend');
const PROFILE = 'Desktop E2E Profile';

test.skip(!existsSync(APP_BIN), 'HealthTrend.app not built');
test.describe.configure({ mode: 'serial' });

const backupDir = mkdtempSync(join(tmpdir(), 'healthtrend-e2e-backup-'));

async function launch(): Promise<{ app: ElectronApplication; win: Page }> {
  const userData = mkdtempSync(join(tmpdir(), 'healthtrend-e2e-profile-'));
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ backupDir }));
  const app = await electron.launch({ executablePath: APP_BIN, env: { ...process.env, HEALTHTREND_USER_DATA: userData } });
  const win = await app.firstWindow();
  return { app, win };
}

test('desktop app: three modes; personal opens without password', async () => {
  const { app, win } = await launch();
  await expect(win).toHaveTitle('HealthTrend');
  await expect(win.getByRole('button', { name: '进入访客模式' })).toBeVisible();
  await expect(win.getByRole('button', { name: '查看示范' })).toBeVisible();
  await win.getByRole('button', { name: '进入我的档案' }).click();
  await expect(win.getByRole('heading', { name: '健康记录' })).toBeVisible();
  await expect(win.getByRole('heading', { name: '设置恢复密码' })).toHaveCount(0);
  await win.getByLabel('档案显示名').fill(PROFILE);
  await win.getByLabel('我确认以上显示名对应该档案所属人').check();
  await win.getByRole('button', { name: '保存档案身份' }).click();
  await expect(win.getByLabel('档案显示名')).toHaveValue(PROFILE);

  await win.goto('app://healthtrend/?mode=demo');
  await expect(win.getByText('示范数据 · 非真实病历').first()).toBeVisible();
  await app.close();
});

test('desktop app: personal stays open after reload (no unlock wall)', async () => {
  const { app, win } = await launch();
  await win.getByRole('button', { name: '进入我的档案' }).click();
  await expect(win.getByRole('heading', { name: '健康记录' })).toBeVisible();
  await win.getByLabel('档案显示名').fill(PROFILE);
  await win.getByLabel('我确认以上显示名对应该档案所属人').check();
  await win.getByRole('button', { name: '保存档案身份' }).click();
  await win.reload();
  await expect(win.getByRole('heading', { name: '健康记录' })).toBeVisible();
  await expect(win.getByLabel('档案显示名')).toHaveValue(PROFILE);
  await app.close();
});
