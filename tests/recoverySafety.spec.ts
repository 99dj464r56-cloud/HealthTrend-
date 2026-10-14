import { expect, test, type Page } from '@playwright/test';
import { emptyHealthRecord } from '../src/domain/types';
const PASSWORD = 'synthetic-safe-password';
const pending = { ...emptyHealthRecord(), profile: { displayName: 'Synthetic Pending', identityConfirmed: true } };
async function localOnly(page: Page) {
  await page.route('**/__backup/personal', route => route.fulfill({ status: 404, body: '{}' }));
  await page.route('**/__backup/status', route => route.fulfill({ json: { enabled: false } }));
}
async function setup(page: Page) {
  await page.goto('./?mode=personal');
  await page.getByLabel(/恢复密码（至少/).fill(PASSWORD);
  await page.getByLabel(/再次输入恢复密码/).fill(PASSWORD);
  await page.getByRole('button', { name: '设置恢复密码并加密' }).click();
}
test('pending restore cancellation keeps vault empty and never deletes source', async ({ page }) => {
  await localOnly(page);
  const methods: string[] = [];
  await page.route('**/__backup/pending-restore', route => { methods.push(route.request().method()); return route.fulfill({ json: pending }); });
  page.once('dialog', dialog => dialog.dismiss());
  await setup(page);
  await expect(page.getByLabel('档案显示名')).toHaveValue('');
  expect(methods).toEqual(['GET']);
});
test('confirmed pending restore survives encrypted readback and later unlock', async ({ page }) => {
  await localOnly(page);
  await page.route('**/__backup/pending-restore', route => route.fulfill({ json: pending }));
  page.once('dialog', dialog => dialog.accept());
  await setup(page);
  await expect(page.getByLabel('档案显示名')).toHaveValue('Synthetic Pending');
  await page.reload();
  await page.getByLabel('恢复密码', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: '用恢复密码解锁' }).click();
  await expect(page.getByLabel('档案显示名')).toHaveValue('Synthetic Pending');
});
test('manual download requires explicit save confirmation', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', { value: undefined });
    Object.defineProperty(navigator, 'share', { value: undefined });
  });
  await localOnly(page);
  await page.route('**/__backup/pending-restore', route => route.fulfill({ status: 404, body: '{}' }));
  await setup(page);
  const confirm = page.locator('[data-confirm-backup-saved]');
  await expect(confirm).toBeHidden();
  await page.locator('[data-mobile-backup-btn]').click();
  await expect(page.locator('[data-backup-status]')).toContainText('待确认保存');
  await expect(page.locator('.mobile-backup-text')).toContainText('尚未确认');
  await expect(confirm).toBeVisible();
  await confirm.click();
  await expect(page.locator('[data-backup-status]')).toContainText('云同步与恢复未验证');
});
