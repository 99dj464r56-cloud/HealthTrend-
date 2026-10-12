import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// Runs against the e2e dev server (VITE_DISABLE_PERSONAL_SEED=1, HEALTH_BACKUP_DIR=tmp/e2e-backup-dir).
// Each test uses a fresh browser context = fresh temporary IndexedDB; the real personal DB is never touched.
const BACKUP_DIR = resolve('tmp/e2e-backup-dir');
const SHOTS = resolve('tmp/lock-screenshots');
const PASSWORD = 'e2e-only-Passw0rd';
const PROFILE = 'E2E Locked Profile';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await rm(BACKUP_DIR, { recursive: true, force: true });
  await mkdir(BACKUP_DIR, { recursive: true });
  await mkdir(SHOTS, { recursive: true });
});

async function setupPassword(page: Page, url = './?mode=personal'): Promise<void> {
  await page.goto(url);
  // When an encrypted backup already exists, the app first offers to restore it.
  const decline = page.getByRole('button', { name: '不恢复，新建档案' });
  const setup = page.getByRole('heading', { name: '设置恢复密码' });
  await expect(decline.or(setup)).toBeVisible();
  if (await decline.isVisible()) {
    page.once('dialog', (dialog) => void dialog.accept());
    await decline.click();
  }
  await expect(page.getByRole('heading', { name: '设置恢复密码' })).toBeVisible();
  await page.getByLabel(/恢复密码（至少/).fill(PASSWORD);
  await page.getByLabel(/再次输入恢复密码/).fill(PASSWORD);
  await page.getByRole('button', { name: '设置恢复密码并加密' }).click();
}

async function saveProfileName(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: '健康记录' })).toBeVisible();
  await page.getByLabel('档案显示名').fill(PROFILE);
  await page.getByLabel('我确认以上显示名对应该档案所属人').check();
  await page.getByRole('button', { name: '保存档案身份' }).click();
  await expect(page.getByLabel('档案显示名')).toHaveValue(PROFILE);
}

test('first-time setup shows the warning, validates, encrypts and backs up to the (temp) iCloud dir', async ({ page }) => {
  await page.goto('./?mode=personal');
  await expect(page.getByRole('heading', { name: '设置恢复密码' })).toBeVisible();
  await expect(page.getByText('忘记密码将无法恢复加密备份').first()).toBeVisible();
  await expect(page.locator('[data-migration-summary]')).toContainText('空白');
  await page.screenshot({ path: join(SHOTS, '01-set-password.png'), fullPage: true });

  await page.getByLabel(/恢复密码（至少/).fill(PASSWORD);
  await page.getByLabel(/再次输入恢复密码/).fill('different-password');
  await page.getByRole('button', { name: '设置恢复密码并加密' }).click();
  await expect(page.getByRole('alert')).toContainText('两次输入的密码不一致');

  await page.getByLabel(/再次输入恢复密码/).fill(PASSWORD);
  await page.getByRole('button', { name: '设置恢复密码并加密' }).click();
  await saveProfileName(page);
  await expect(page.locator('[data-backup-status]')).toContainText('已备份到 iCloud', { timeout: 15_000 });
  await page.screenshot({ path: join(SHOTS, '03-backup-status.png') });

  // Encrypted at rest in IndexedDB: no plaintext record, ciphertext does not contain the name.
  const raw = await page.evaluate(() => new Promise<{ plain: unknown; enc: string }>((done) => {
    const open = indexedDB.open('health-trend-pdf');
    open.onsuccess = () => {
      const store = open.result.transaction('records').objectStore('records');
      const plain = store.get('current');
      const enc = store.get('current-enc');
      enc.onsuccess = () => done({ plain: plain.result, enc: JSON.stringify(enc.result) });
    };
  }));
  expect(raw.plain).toBeUndefined();
  expect(raw.enc).not.toContain(PROFILE);

  const backup = await readFile(join(BACKUP_DIR, 'health-trend-personal.enc.json'), 'utf8');
  expect(backup).not.toContain(PROFILE);
  expect(backup).not.toContain(PASSWORD);
  expect(JSON.parse(backup)).toMatchObject({ format: 'health-trend-personal-enc', version: 2 });
  expect((await readdir(join(BACKUP_DIR, '备份历史'))).length).toBeGreaterThanOrEqual(1);

  // Lock -> unlock screen; wrong password shows an error; correct password restores data.
  await page.locator('[data-lock-button]').click();
  await expect(page.getByRole('heading', { name: '个人档案已锁定' })).toBeVisible();
  await page.getByLabel('恢复密码', { exact: true }).fill('wrong-password-1');
  await page.getByRole('button', { name: '用恢复密码解锁' }).click();
  await expect(page.getByRole('alert')).toContainText('密码不正确');
  await page.screenshot({ path: join(SHOTS, '02-unlock-wrong-password.png') });
  await page.getByLabel('恢复密码', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: '用恢复密码解锁' }).click();
  await expect(page.getByLabel('档案显示名')).toHaveValue(PROFILE);
});

test('restores the encrypted iCloud backup in a fresh browser profile with the password only', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/?mode=personal');
  // Fresh profile + existing iCloud backup: restore is offered automatically.
  await expect(page.getByRole('heading', { name: '恢复加密备份' })).toBeVisible();
  await page.getByLabel('备份密码').fill('wrong-password-1');
  await page.getByRole('button', { name: '解密并恢复' }).click();
  await expect(page.getByRole('alert')).toContainText('密码不正确');
  await page.getByLabel('备份密码').fill(PASSWORD);
  await page.getByRole('button', { name: '解密并恢复' }).click();
  const skipTouch = page.getByRole('button', { name: /暂不启用/ });
  if (await skipTouch.isVisible({ timeout: 1500 }).catch(() => false)) await skipTouch.click();
  await expect(page.getByLabel('档案显示名')).toHaveValue(PROFILE);
  await context.close();
});

test('auto-locks after 15 minutes idle', async ({ page }) => {
  await page.clock.install();
  await setupPassword(page);
  await expect(page.getByRole('heading', { name: '健康记录' })).toBeVisible();
  await page.clock.fastForward('15:30');
  await expect(page.getByRole('heading', { name: '个人档案已锁定' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('闲置 15 分钟已自动锁定')).toBeVisible();
});

async function addPrfAuthenticator(context: BrowserContext, page: Page): Promise<void> {
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      ctap2Version: 'ctap2_1',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
      hasPrf: true,
    },
  });
}

test('Touch ID (virtual platform authenticator with PRF) unlocks; password still works', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await addPrfAuthenticator(context, page);
  // localhost (not 127.0.0.1): IP addresses are not valid WebAuthn rpIds.
  await setupPassword(page, 'http://localhost:4173/?mode=personal');
  await expect(page.getByRole('heading', { name: /启用 Touch ID 解锁/ })).toBeVisible();
  await page.getByRole('button', { name: /用 Touch ID 解锁|启用 Touch ID/ }).click();
  await saveProfileName(page);

  await page.locator('[data-lock-button]').click();
  await expect(page.getByRole('button', { name: '使用 Touch ID 解锁' })).toBeVisible();
  await page.screenshot({ path: join(SHOTS, '04-unlock-touchid.png'), fullPage: true });
  await page.getByRole('button', { name: '使用 Touch ID 解锁' }).click();
  await expect(page.getByLabel('档案显示名')).toHaveValue(PROFILE);

  await page.locator('[data-lock-button]').click();
  await page.getByLabel('恢复密码', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: '用恢复密码解锁' }).click();
  await expect(page.getByLabel('档案显示名')).toHaveValue(PROFILE);
  await context.close();
});
