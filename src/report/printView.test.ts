// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { HealthRecord } from '../domain/types';
import { emptyHealthRecord } from '../domain/types';
import { createPrintView, createProvenanceAppendix } from './printView';
import { buildReportModel } from './reportModel';

describe('print view safety and layout groups', () => {
  it('renders untrusted imported names as text rather than executable HTML', () => {
    const record: HealthRecord = {
      ...emptyHealthRecord(),
      profile: { displayName: 'Alex Demo', identityConfirmed: true },
      medications: [], observations: [], sources: [],
      indicators: [{
        id: 'x', nameZh: '示例', nameEn: '<img src=x onerror=alert(1)>', purposeZh: '用途', purposeEn: 'Purpose',
        category: 'Group', unit: 'U/L', lowerLimit: null, upperLimit: null, priority: false,
      }],
      reportTextBlocks: [{
        id: 't1', sourceId: null, reportName: 'R', reportDate: null, laboratory: null, pageNumber: null,
        sectionTitle: '结论', sectionKind: 'conclusion',
        body: '<script>alert(1)</script>', kind: 'verbatim',
        contentFingerprint: 'r', confirmed: true,
      }],
    };
    const view = createPrintView(buildReportModel(record), { onPrint: () => undefined, onBack: () => undefined });
    expect(view.querySelector('img,script')).toBeNull();
    expect(view.querySelector('.chart-title-en')?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(view.querySelector('.category-section')).not.toBeNull();
    expect(view.querySelector('.chart-empty')?.textContent).toContain('No measurements');
    expect(view.querySelector('[data-profile-subject]')?.textContent).toContain('Alex Demo');
    expect(view.querySelector('[data-report-text]')?.textContent).toContain('<script>alert(1)</script>');
  });

  it('omits the Apple Health section from the printed report even when records exist', () => {
    const record: HealthRecord = {
      ...emptyHealthRecord(),
      profile: { displayName: 'Alex Demo', identityConfirmed: true },
      appleHealthRecords: [{
        id: 'ah-1', kind: 'sample', typeIdentifier: 'HKQuantityTypeIdentifierStepCount',
        value: 1000, unit: 'count', startAt: '2026-01-15 09:00:00 +0800', endAt: null,
        localDate: '2026-01-15', sourceName: 'Demo', sourceBundleOrDevice: null,
        workoutActivityType: null, duration: null, durationUnit: null,
        importFingerprint: 'fp-1', sourceFileId: 'src-1', importedAt: '2026-03-01T00:00:00.000Z', confirmed: true,
      }],
    };
    const model = buildReportModel(record);
    const view = createPrintView(model, { onPrint: () => undefined, onBack: () => undefined });
    expect(view.querySelector('[data-apple-health]')).toBeNull();
    expect(view.textContent).not.toContain('Apple 健康');
    expect(createProvenanceAppendix(model).textContent).not.toContain('Apple 健康');
  });

  it('shows monitoring note, then known packaging hint, before falling back to Not linked', () => {
    const record: HealthRecord = {
      ...emptyHealthRecord(),
      profile: { displayName: 'Alex Demo', identityConfirmed: true },
      medications: [
        { id: 'm-note', nameZh: '示例药A', nameEn: 'Example A', linkedIndicatorIds: [], monitoringNote: '体重' },
        { id: 'm-known', nameZh: '氯沙坦', nameEn: 'Losartan', linkedIndicatorIds: [], monitoringNote: null },
        { id: 'm-unknown', nameZh: '示例药B', nameEn: 'Example B', linkedIndicatorIds: [], monitoringNote: null },
      ],
    };
    const view = createPrintView(buildReportModel(record), { onPrint: () => undefined, onBack: () => undefined });
    const rows = [...view.querySelectorAll('.report-medications tbody tr')].map((row) => row.lastElementChild?.textContent);
    expect(rows).toEqual(['体重', '血压、肾功能、血钾', '未关联 / Not linked']);
  });
});
