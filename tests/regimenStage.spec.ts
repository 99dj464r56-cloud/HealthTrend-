import { expect, test } from '@playwright/test';

test('regimen stage with empty endDate saves as 仍使用 and shows dates in the table', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('./?mode=guest');
  await page.getByLabel('档案显示名').fill('Stage Date User');
  await page.getByLabel('我确认以上显示名对应该档案所属人').check();
  const oldProfile = await page.$('#profile-form');
  await page.getByRole('button', { name: '保存档案身份' }).click();
  await page.waitForFunction((form) => !form?.isConnected, oldProfile);

  await page.getByLabel('中文药名').fill('替米沙坦');
  await page.getByLabel('English medication name').fill('Telmisartan');
  await page.getByRole('button', { name: '保存药物身份' }).click();
  await expect(page.getByRole('cell', { name: '替米沙坦 / Telmisartan' })).toBeVisible();

  await page.getByRole('button', { name: '添加阶段 替米沙坦' }).click();
  await expect(page.locator('#regimen-stage-form')).toBeVisible();
  await expect(page.locator('#medication-form')).toHaveCount(0);
  await page.locator('#stage-strength-label').fill('80 mg');
  await page.locator('#stage-dose-amount').fill('1');
  await page.locator('#stage-dose-unit').fill('tablet');
  await page.locator('#stage-frequency').fill('每晚一片');
  await page.locator('#stage-start-date').fill('2024-05-01');
  // endDate left empty → 仍使用
  await page.getByRole('button', { name: '添加用药阶段（保留历史）' }).click();

  await expect(page.locator('.stage-line')).toContainText('2024-05-01 – 仍使用');
  await expect(page.locator('.stage-line')).toContainText('80 mg');
  await expect(page.locator('.stage-line')).toContainText('每晚一片');

  await page.locator('.stage-line').getByText('编辑用法', { exact: true }).click();
  await expect(page.locator('#stage-start-date')).toHaveValue('2024-05-01');
  await expect(page.locator('#stage-end-date')).toHaveValue('');
  await page.locator('#stage-end-date').fill('2025-01-01');
  await page.getByRole('button', { name: '保存用药阶段' }).click();
  await expect(page.locator('.stage-line')).toContainText('2024-05-01 – 2025-01-01');
});
