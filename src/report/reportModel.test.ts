import { describe, expect, it } from 'vitest';
import type { HealthRecord } from '../domain/types';
import { buildReportModel } from './reportModel';

const record: HealthRecord = {
  schemaVersion: 1,
  medications: [{ id: 'med-1', nameZh: '示例药', nameEn: 'Example medicine', strength: '10 mg', instructions: '每日一次', startDate: '2025-01-01', endDate: null, linkedIndicatorIds: ['a'] }],
  indicators: [
    { id: 'a', nameZh: '指标甲', nameEn: 'Marker A', purposeZh: '用途甲', purposeEn: 'Purpose A', category: '血脂', unit: 'mmol/L', lowerLimit: 1, upperLimit: 4, priority: true },
    { id: 'b', nameZh: '指标乙', nameEn: 'Marker B', purposeZh: '用途乙', purposeEn: 'Purpose B', category: '血脂', unit: 'mg/dL', lowerLimit: null, upperLimit: 100, priority: false },
    { id: 'c', nameZh: '指标丙', nameEn: 'Marker C', purposeZh: '用途丙', purposeEn: 'Purpose C', category: '肾功能', unit: 'mL/min', lowerLimit: 60, upperLimit: null, priority: false },
  ],
  observations: [
    { id: 'reading', indicatorId: 'a', date: '2026-01-02', value: 2, unit: 'mmol/L', sourceId: null, confirmed: true },
    { id: 'reading-2', indicatorId: 'b', date: '2026-01-02', value: 50, unit: 'mg/dL', sourceId: null, confirmed: true },
  ],
  sources: [],
};

describe('print report model', () => {
  it('keeps priority indicators distinct, categories separate, and chart values attached to categories', () => {
    const model = buildReportModel(record);
    expect(model.priorityIndicators.map((series) => series.nameEn)).toEqual(['Marker A']);
    expect(model.categories.map((item) => item.category)).toEqual(['肾功能', '血脂']);
    expect(model.categories.find((item) => item.category === '血脂')?.series.map((series) => series.nameEn)).toEqual(['Marker A', 'Marker B']);
  });

  it('attaches exact medication names, dose, instructions, and dates without interpreting cause', () => {
    const model = buildReportModel(record);
    expect(model.priorityIndicators[0].medications[0]).toMatchObject({
      nameZh: '示例药', nameEn: 'Example medicine', strength: '10 mg', instructions: '每日一次', startDate: '2025-01-01', endDate: null,
    });
  });

  it('includes indicators without measurements so the report does not silently omit them', () => {
    const model = buildReportModel(record);
    expect(model.categories.find((item) => item.category === '肾功能')?.series[0].points).toEqual([]);
  });
});
