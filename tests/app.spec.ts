import { expect, test } from '@playwright/test';

test('first run explains local privacy and shows an empty record state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Health Trend PDF' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '你的资料只保存在此设备' })).toBeVisible();
  await expect(page.getByText('还没有健康记录')).toBeVisible();
  await expect(page.getByRole('button', { name: '开始整理' })).toBeVisible();
});
