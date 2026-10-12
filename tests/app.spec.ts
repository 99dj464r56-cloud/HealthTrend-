import { expect, test } from '@playwright/test';

test('first run explains local privacy and shows an empty record state', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Health Trend PDF' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '你的资料只保存在此设备' })).toBeVisible();
  await expect(page.getByText('还没有健康记录')).toBeVisible();
  await expect(page.getByRole('button', { name: '开始整理' })).toBeVisible();
});

test('a person can add, edit, delete, and back up medicine and lab data', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '开始整理' }).click();
  await expect(page.getByRole('heading', { name: '健康记录工作区' })).toBeVisible();

  await page.getByLabel('档案显示名').fill('Alex Demo');
  await page.getByLabel('我确认以上显示名对应该档案所属人').check();
  await page.getByRole('button', { name: '保存档案身份' }).click();
  await expect(page.getByLabel('档案显示名')).toHaveValue('Alex Demo');

  await page.getByLabel('中文药名').fill('示例降压药');
  await page.getByLabel('English medication name').fill('Example blood pressure medicine');
  // Submit via Enter: Playwright mouse click on this below-fold submit is flaky after Apple Health panel.
  await page.getByLabel('English medication name').press('Enter');
  await expect(page.getByRole('cell', { name: '示例降压药 / Example blood pressure medicine' })).toBeVisible();

  await page.getByLabel('规格（如 5 mg，不是包装数量）').fill('10 mg');
  await page.getByLabel('单次剂量数量（如 1）').fill('1');
  await page.getByLabel('单次剂量单位（如 tablet / 片）').fill('tablet');
  await page.getByLabel('服用频率').fill('每日晚间一次');
  await page.getByLabel('包装数量（可选，如 200 tablets）').fill('30 tablets');
  await page.getByLabel('包装数量（可选，如 200 tablets）').press('Enter');
  await expect(page.getByText('每日晚间一次').first()).toBeVisible();
  await expect(page.getByText(/30 tablets/).first()).toBeVisible();

  await page.getByLabel('中文指标名称').fill('肌酐');
  await page.getByLabel('English indicator name').fill('Creatinine');
  await page.getByLabel('中文用途').fill('观察肾功能');
  await page.getByLabel('English purpose').fill('Tracks kidney function');
  await page.getByLabel('分类').fill('肾功能');
  await page.locator('#indicator-unit').fill('μmol/L');
  await page.getByLabel('新建结果默认下限（不改写历史）').fill('');
  await page.getByLabel('新建结果默认上限（不改写历史）').fill('100');
  await page.getByLabel('检查日期').fill('2025-03-11');
  await page.getByLabel('检查数值').fill('88.4');
  await page.getByRole('button', { name: '保存指标和检查结果' }).click();
  await expect(page.getByText(/88\.4 μmol\/L/)).toBeVisible();

  await page.getByRole('button', { name: '编辑指标 肌酐' }).click();
  await page.getByLabel('English indicator name').fill('Serum creatinine');
  await page.getByRole('button', { name: '保存指标' }).click();
  await expect(page.getByRole('heading', { name: '肌酐 / Serum creatinine' })).toBeVisible();

  await page.getByRole('button', { name: '编辑结果 2025-03-11' }).click();
  await page.getByLabel(/检查数值（μmol\/L/).fill('90');
  await page.getByRole('button', { name: '保存检查结果' }).click();
  await expect(page.getByText(/90 μmol\/L/)).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '删除结果 2025-03-11' }).click();
  await expect(page.getByText('暂无已确认结果')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON 备份' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/health-record.*\.json/i);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '删除药物 示例降压药' }).click();
  await expect(page.getByText('目前没有药物')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '删除指标 肌酐' }).click();
  await expect(page.getByText('目前没有已确认的检查指标')).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#backup-import').setInputFiles({
    name: 'synthetic-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      schemaVersion: 4,
      profile: { displayName: 'Alex Demo', identityConfirmed: true },
      medications: [{
        id: 'imported-med', nameZh: '备份药', nameEn: 'Backup medicine', linkedIndicatorIds: [],
      }],
      regimenStages: [],
      indicators: [],
      observations: [],
      reportTextBlocks: [],
      appleHealthRecords: [],
      sources: [],
    })),
  });
  await expect(page.getByRole('cell', { name: '备份药 / Backup medicine' })).toBeVisible();
  await expect(page.getByText('目前没有已确认的检查指标')).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '删除全部本机资料' }).click();
  await expect(page.getByText('还没有健康记录')).toBeVisible();
});
