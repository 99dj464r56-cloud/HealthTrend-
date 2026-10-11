import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

test('renders separate priority/category charts and exports the synthetic A4 landscape PDF', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '开始整理' }).click();
  await page.locator('#backup-import').setInputFiles({
    name: 'synthetic-record.json', mimeType: 'application/json',
    buffer: readFileSync(fileURLToPath(new URL('./fixtures/synthetic-record.json', import.meta.url))),
  });
  await expect(page.getByText('合成示例药 / Synthetic medicine')).toBeVisible();

  await page.getByRole('button', { name: '预览趋势报告 / PDF' }).click();
  await expect(page.locator('.print-report')).toBeVisible();
  await expect(page.getByRole('heading', { name: /第一类：必须关注的重要指标/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Category: Synthetic group/ })).toBeVisible();
  await expect(page.locator('.priority-section .chart-card')).toHaveCount(1);
  await expect(page.locator('.category-section .chart-card')).toHaveCount(2);
  await expect(page.locator('.priority-section .point-label')).toHaveCount(3);
  await expect(page.locator('.priority-section .point-label').nth(0)).toContainText('2024-06');
  await expect(page.locator('.priority-section .point-label').nth(1)).toContainText('↓ 2.8');
  await expect(page.locator('.priority-section .point-label').nth(2)).toContainText('↑ 7.4');
  await expect(page.locator('.priority-section .chart-medications')).toContainText('10 mg');

  await page.pdf({ path: 'test-results/synthetic-health-trend.pdf', printBackground: true, preferCSSPageSize: true });
});
