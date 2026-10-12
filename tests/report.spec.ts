import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

test('renders separate priority/category charts and exports the synthetic A4 landscape PDF', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('./?mode=guest');
  await page.locator('#backup-import').setInputFiles({
    name: 'synthetic-record.json', mimeType: 'application/json',
    buffer: readFileSync(fileURLToPath(new URL('./fixtures/synthetic-record.json', import.meta.url))),
  });
  await expect(page.getByRole('cell', { name: '合成示例药 / Synthetic medicine' }).first()).toBeVisible();

  await page.getByRole('button', { name: '预览趋势报告 / PDF' }).click();
  await expect(page.locator('.print-report')).toBeVisible();
  await expect(page.getByText(/Record for: Alex Demo/)).toBeVisible();
  await expect(page.getByRole('heading', { name: /第一类：必须关注的重要指标/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Category: Synthetic group/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Category: 血细胞分析/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Category: 肝功能/ })).toBeVisible();
  await expect(page.locator('[data-provenance-appendix]')).toHaveCount(0);
  await expect(page.getByText(/附录：资料来源与可追溯信息|Provenance appendix/)).toHaveCount(0);
  await expect(page.locator('.report-footer')).toContainText('health-trend-pdf-report@');
  await expect(page.locator('.priority-section .chart-card')).toHaveCount(2);
  await expect(page.locator('.category-section .chart-card')).toHaveCount(4);
  const priorityMarker = page.locator('.priority-section .chart-card').filter({ hasText: '合成示例指标' });
  // Last three labeled points for the primary synthetic marker (includes same-day pair on 2026-09-09).
  await expect(priorityMarker.locator('.point-label')).toHaveCount(3);
  await expect(priorityMarker.locator('.point-label').nth(0)).toContainText('2025-07-01');
  await expect(priorityMarker.locator('.point-label').nth(1)).toContainText('2026-09-09');
  await expect(priorityMarker.locator('.chart-medications').first()).toContainText('10 mg');
  // Dual presentation: priority markers also appear under their categories.
  await expect(page.locator('.category-section .chart-card').filter({ hasText: '合成示例指标' })).toHaveCount(1);
  await expect(page.locator('.category-section .chart-card').filter({ hasText: '白细胞计数' })).toHaveCount(1);
  await expect(page.getByText(/报告文字结论与建议|Report text/)).toBeVisible();
  await expect(page.getByText('Synthetic conclusion text for layout testing only')).toBeVisible();

  await page.pdf({ path: 'test-results/synthetic-health-trend.pdf', printBackground: true, preferCSSPageSize: true });
});
