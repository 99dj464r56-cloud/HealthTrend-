import { expect, test } from '@playwright/test';

test('local OCR produces editable drafts, and only confirmed values enter the record', async ({ page }) => {
  const requests: Array<{ url: string; method: string; body: string | null }> = [];
  page.on('request', (request) => requests.push({ url: request.url(), method: request.method(), body: request.postData() }));
  await page.goto('./');
  await page.getByRole('button', { name: '开始整理' }).click();
  await page.getByLabel('档案显示名').fill('Alex Demo');
  await page.getByLabel('我确认以上显示名对应该档案所属人').check();
  await page.getByRole('button', { name: '保存档案身份' }).click();
  await expect(page.getByLabel('档案显示名')).toHaveValue('Alex Demo');

  const imageBytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1800;
    canvas.height = 250;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas unavailable');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#000';
    context.font = 'bold 64px Arial';
    context.fillText('Creatinine 88.4 umol/L (44 - 110)', 24, 145);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG encode failed')), 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.getByLabel('选择照片或 PDF 文件').setInputFiles({
    name: 'synthetic-lab.png', mimeType: 'image/png', buffer: Buffer.from(imageBytes),
  });

  await expect(page.getByRole('status')).toContainText('完成 1 页本机识别', { timeout: 120_000 });
  const candidate = page.locator('.import-candidate').first();
  await expect(candidate).toBeVisible();
  await expect(candidate.locator('.candidate-source')).toContainText('Creatinine');
  const input = (label: string) => candidate.getByLabel(label);
  await input('中文指标名称').fill('肌酐');
  await input('检查日期').fill('2026-06-26');
  await input('分类').fill('肾功能');
  await input('中文用途').fill('了解肾脏过滤功能');
  await input('English purpose').fill('Assesses kidney filtration');
  await candidate.getByLabel('English purpose').press('Enter');
  await expect(page.getByRole('heading', { name: '肌酐 / Creatinine' })).toBeVisible();
  await expect(page.locator('.records-table').getByText('88.4 umol/L')).toBeVisible();

  const appOrigin = new URL(page.url()).origin;
  const appBasePath = new URL(page.url()).pathname;
  expect(requests.every((request) => new URL(request.url).origin === appOrigin)).toBe(true);
  expect(requests.some((request) => new URL(request.url).pathname === `${appBasePath}ocr/worker.min.js`)).toBe(true);
  expect(requests.some((request) => new URL(request.url).pathname === `${appBasePath}ocr/lang/eng.traineddata.gz`)).toBe(true);
  expect(requests.some((request) => new URL(request.url).pathname === `${appBasePath}ocr/lang/chi_sim.traineddata.gz`)).toBe(true);
  expect(requests.every((request) => request.method === 'GET' || request.method === 'HEAD')).toBe(true);
  expect(requests.some((request) => request.body?.includes('Creatinine'))).toBe(false);
});
