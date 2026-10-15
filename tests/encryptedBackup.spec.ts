import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('personal encrypted backup restores after reload and failed/canceled attempts preserve data', async ({ page }) => {
  await page.goto('./?mode=personal');
  await page.getByLabel('档案显示名').fill('Synthetic Backup Person');
  await page.getByLabel('我确认以上显示名对应该档案所属人').check();
  await page.getByRole('button', { name: '保存档案身份' }).click();
  await expect(page.getByLabel('档案显示名')).toHaveValue('Synthetic Backup Person');
  await page.getByRole('button', { name: '导出加密备份', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('备份密码', { exact: true }).fill('test-backup-secret');
  await dialog.getByLabel('再次输入密码').fill('mismatch');
  await dialog.getByRole('button', { name: '加密并下载' }).click();
  await expect(dialog.getByRole('alert')).toContainText('两次密码不一致');
  await dialog.getByLabel('再次输入密码').fill('test-backup-secret');
  const downloaded = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '加密并下载' }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('health-trend-personal.enc.json');
  const path = await download.path();
  const text = await readFile(path!, 'utf8');
  expect(text).not.toContain('Synthetic Backup Person');
  expect(text).not.toContain('test-backup-secret');
  expect(JSON.parse(text).format).toBe('health-trend-personal-enc');
  await expect(dialog).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('heading', { name: '健康记录' })).toBeVisible();
  await expect(page.getByLabel('档案显示名')).toHaveValue('Synthetic Backup Person');
  await page.getByLabel('档案显示名').fill('Current Local Person');
  await page.getByRole('button', { name: '保存档案身份' }).click();
  await expect(page.getByLabel('档案显示名')).toHaveValue('Current Local Person');

  await page.locator('#backup-import').setInputFiles(path!);
  await dialog.getByLabel('备份密码', { exact: true }).fill('wrong-password');
  await dialog.getByRole('button', { name: '解密并预览' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByLabel('档案显示名')).toHaveValue('Current Local Person');

  page.once('dialog', d => d.dismiss());
  await page.locator('#backup-import').setInputFiles(path!);
  await dialog.getByLabel('备份密码', { exact: true }).fill('test-backup-secret');
  await dialog.getByRole('button', { name: '解密并预览' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('档案显示名')).toHaveValue('Current Local Person');

  page.once('dialog', d => d.accept());
  await page.locator('#backup-import').setInputFiles(path!);
  await dialog.getByLabel('备份密码', { exact: true }).fill('test-backup-secret');
  await dialog.getByRole('button', { name: '解密并预览' }).click();
  await expect(page.getByLabel('档案显示名')).toHaveValue('Synthetic Backup Person');
  await expect(page.getByRole('button', { name: '导出 JSON 备份', exact: true })).toHaveCount(0);
});

test('mobile personal flow cancels export without downloading and restores legacy JSON', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./?mode=personal');
  let downloads = 0;
  page.on('download', () => { downloads += 1; });
  await page.getByRole('button', { name: '导出加密备份', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(downloads).toBe(0);
  const legacy = {
    schemaVersion: 4, profile: { displayName: 'Legacy Synthetic Person', identityConfirmed: true },
    medications: [], regimenStages: [], indicators: [], observations: [], reportTextBlocks: [], appleHealthRecords: [], sources: [],
  };
  page.once('dialog', async d => {
    expect(d.message()).toContain('旧版明文备份');
    await d.accept();
  });
  await page.locator('#backup-import').setInputFiles({ name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)) });
  await expect(page.getByLabel('档案显示名')).toHaveValue('Legacy Synthetic Person');
  await page.reload();
  await expect(page.getByLabel('档案显示名')).toHaveValue('Legacy Synthetic Person');
  expect(downloads).toBe(0);
});
