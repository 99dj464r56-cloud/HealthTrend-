import { describe, expect, it } from 'vitest';
import type { Indicator, Observation } from '../domain/types';
import { buildSeries, classifyObservation } from './series';

const indicator: Indicator = {
  id: 'lab-a', nameZh: '示例指标', nameEn: 'Example marker', purposeZh: '用途', purposeEn: 'Purpose',
  category: '肾功能', unit: 'mmol/L', lowerLimit: 3, upperLimit: 7, priority: true,
};
const observations: Observation[] = [
  { id: 'o3', indicatorId: 'lab-a', date: '2026-09-03', value: 8, unit: 'mmol/L', sourceId: null, confirmed: true },
  { id: 'wrong-unit', indicatorId: 'lab-a', date: '2026-07-01', value: 99, unit: 'mg/dL', sourceId: null, confirmed: true },
  { id: 'o1', indicatorId: 'lab-a', date: '2024-02-10', value: 4, unit: 'mmol/L', sourceId: null, confirmed: true },
  { id: 'o2', indicatorId: 'lab-a', date: '2025-06-12', value: 5, unit: 'mmol/L', sourceId: null, confirmed: true },
];

describe('chart series and reference classification', () => {
  it('sorts observations by date and keeps each unit in an independent series', () => {
    const series = buildSeries(indicator, observations);
    expect(series).toHaveLength(2);
    const mmol = series.find((item) => item.unit === 'mmol/L');
    const mg = series.find((item) => item.unit === 'mg/dL');
    expect(mmol?.points.map((point) => point.date)).toEqual(['2024-02-10', '2025-06-12', '2026-09-03']);
    expect(mmol?.referenceRange).toEqual({ lower: 3, upper: 7 });
    expect(mg?.points).toHaveLength(1);
    expect(mg?.referenceRange).toEqual({ lower: null, upper: null });
  });

  it('classifies in-range, low, high, lower-only, upper-only, and unavailable reference ranges', () => {
    expect(classifyObservation(5, { lower: 3, upper: 7 })).toBe('in-range');
    expect(classifyObservation(2, { lower: 3, upper: 7 })).toBe('low');
    expect(classifyObservation(8, { lower: 3, upper: 7 })).toBe('high');
    expect(classifyObservation(2, { lower: 3, upper: null })).toBe('low');
    expect(classifyObservation(8, { lower: null, upper: 7 })).toBe('high');
    expect(classifyObservation(5, { lower: null, upper: null })).toBe('unknown');
  });
});
