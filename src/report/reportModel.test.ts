import { describe, expect, it } from 'vitest';
import type { HealthRecord } from '../domain/types';
import { emptyHealthRecord } from '../domain/types';
import { buildReportModel } from './reportModel';

const record: HealthRecord = {
  ...emptyHealthRecord(),
  profile: { displayName: 'Alex Demo', identityConfirmed: true },
  medications: [{ id: 'med-1', nameZh: '示例药', nameEn: 'Example medicine', linkedIndicatorIds: ['a'], monitoringNote: null }],
  regimenStages: [{
    id: 'stage-1', medicationId: 'med-1', strengthLabel: '10 mg', doseAmount: '1', doseUnit: 'tablet',
    frequency: '每日一次', form: 'tablet', packCountLabel: null, startDate: '2025-01-01', endDate: null,
  }],
  indicators: [
    { id: 'a', nameZh: '指标甲', nameEn: 'Marker A', purposeZh: '用途甲', purposeEn: 'Purpose A', category: '血脂', unit: 'mmol/L', lowerLimit: 1, upperLimit: 4, priority: true },
    { id: 'b', nameZh: '指标乙', nameEn: 'Marker B', purposeZh: '用途乙', purposeEn: 'Purpose B', category: '血脂', unit: 'mg/dL', lowerLimit: null, upperLimit: 100, priority: false },
    { id: 'c', nameZh: '指标丙', nameEn: 'Marker C', purposeZh: '用途丙', purposeEn: 'Purpose C', category: '肾功能', unit: 'mL/min', lowerLimit: 60, upperLimit: null, priority: false },
  ],
  observations: [
    {
      id: 'reading', indicatorId: 'a', date: '2026-01-02', rawValue: '2', value: 2, comparator: 'none',
      unit: 'mmol/L', lowerLimit: 1, upperLimit: 4, rangeProvenance: 'from-report',
      laboratory: null, method: null, specimen: null, sourceId: null, pageNumber: null, confirmed: true,
    },
    {
      id: 'reading-2', indicatorId: 'b', date: '2026-01-02', rawValue: '50', value: 50, comparator: 'none',
      unit: 'mg/dL', lowerLimit: null, upperLimit: 100, rangeProvenance: 'from-report',
      laboratory: null, method: null, specimen: null, sourceId: null, pageNumber: null, confirmed: true,
    },
  ],
  reportTextBlocks: [{
    id: 'txt-1', sourceId: null, reportName: 'Demo', reportDate: '2026-01-02', laboratory: null, pageNumber: 1,
    sectionTitle: '结论', sectionKind: 'conclusion', body: 'Verbatim synthetic conclusion.', kind: 'verbatim',
    contentFingerprint: 'demo|2026-01-02||1|结论|Verbatim synthetic conclusion.', confirmed: true,
  }],
};

describe('print report model', () => {
  it('keeps priority indicators distinct, categories separate, and chart values attached to categories', () => {
    const model = buildReportModel(record);
    expect(model.profileDisplayName).toBe('Alex Demo');
    expect(model.priorityIndicators.map((series) => series.nameEn)).toEqual(['Marker A']);
    expect(model.categories.map((item) => item.category)).toEqual(['肾功能', '血脂']);
    expect(model.categories.find((item) => item.category === '血脂')?.series.map((series) => series.nameEn)).toEqual(['Marker A', 'Marker B']);
    expect(model.provenance.templateId).toContain('health-trend-pdf');
    expect(model.provenance.originalFilesRetained).toBe(false);
  });

  it('attaches regimen stages without interpreting cause', () => {
    const model = buildReportModel(record);
    expect(model.medications[0]?.stages[0]).toMatchObject({
      strengthLabel: '10 mg', frequency: '每日一次', startDate: '2025-01-01', endDate: null,
    });
    expect(model.priorityIndicators[0].medications[0]).toMatchObject({
      nameZh: '示例药', strength: '10 mg', instructions: '每日一次', startDate: '2025-01-01',
    });
  });

  it('includes confirmed report text sections for the PDF', () => {
    const model = buildReportModel(record);
    expect(model.reportTextSections).toHaveLength(1);
    expect(model.reportTextSections[0]?.blocks[0]?.body).toBe('Verbatim synthetic conclusion.');
  });

  it('includes indicators without measurements so the report does not silently omit them', () => {
    const model = buildReportModel(record);
    expect(model.categories.find((item) => item.category === '肾功能')?.series[0].points).toEqual([]);
  });

  it('keeps Apple Health rows in separate groups from lab categories', () => {
    const withApple = {
      ...record,
      appleHealthRecords: [{
        id: 'ah-1', kind: 'sample' as const, typeIdentifier: 'HKQuantityTypeIdentifierStepCount',
        value: 1000, unit: 'count', startAt: '2026-01-15 09:00:00 +0800', endAt: null,
        localDate: '2026-01-15', sourceName: 'Demo', sourceBundleOrDevice: null,
        workoutActivityType: null, duration: null, durationUnit: null,
        importFingerprint: 'fp-1', sourceFileId: 'src-1', importedAt: '2026-03-01T00:00:00.000Z', confirmed: true as const,
      }],
    };
    const model = buildReportModel(withApple);
    expect(model.appleHealthGroups.some((g) => g.category.includes('Apple'))).toBe(true);
    expect(model.categories.every((c) => !c.category.includes('Apple'))).toBe(true);
  });

});
