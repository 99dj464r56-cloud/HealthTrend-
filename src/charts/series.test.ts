import { describe, expect, it } from 'vitest';
import type { Indicator, Observation } from '../domain/types';
import { buildSeries, classifyObservation } from './series';

const indicator: Indicator = {
  id: 'lab-a', nameZh: '示例指标', nameEn: 'Example marker', purposeZh: '用途', purposeEn: 'Purpose',
  category: '代谢', unit: 'mmol/L', lowerLimit: 3, upperLimit: 7, priority: true,
};

function obs(partial: Partial<Observation> & Pick<Observation, 'id' | 'date' | 'value' | 'unit'>): Observation {
  return {
    indicatorId: 'lab-a',
    rawValue: partial.rawValue ?? String(partial.value ?? ''),
    comparator: 'none',
    lowerLimit: 3,
    upperLimit: 7,
    rangeProvenance: 'from-report',
    laboratory: null,
    method: null,
    specimen: null,
    sourceId: null,
    pageNumber: null,
    confirmed: true,
    ...partial,
  };
}

const observations: Observation[] = [
  obs({ id: 'o3', date: '2026-09-03', value: 8, unit: 'mmol/L', lowerLimit: 3, upperLimit: 7 }),
  obs({ id: 'wrong-unit', date: '2026-07-01', value: 99, unit: 'mg/dL', lowerLimit: null, upperLimit: null, rangeProvenance: 'unknown', rawValue: '99' }),
  obs({ id: 'o1', date: '2024-02-10', value: 4, unit: 'mmol/L', lowerLimit: 3, upperLimit: 7 }),
  obs({ id: 'o2', date: '2025-06-12', value: 5, unit: 'mmol/L', lowerLimit: 3, upperLimit: 7 }),
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

  it('classifies using each observation’s own limits, not later indicator catalog defaults', () => {
    const mixed: Observation[] = [
      obs({ id: 'a', date: '2024-01-01', value: 5.5, unit: 'mmol/L', lowerLimit: 3, upperLimit: 6, rawValue: '5.5' }),
      obs({ id: 'b', date: '2026-01-01', value: 5.5, unit: 'mmol/L', lowerLimit: 4, upperLimit: 5, rawValue: '5.5' }),
    ];
    // Indicator catalog now claims a different default range — must not reclassify history.
    const updatedIndicator = { ...indicator, lowerLimit: 0, upperLimit: 100 };
    const series = buildSeries(updatedIndicator, mixed);
    expect(series[0]?.referenceRange).toEqual({ lower: null, upper: null }); // differing per-point ranges → no fake unified band
    expect(classifyObservation(series[0]!.points[0]!.value, {
      lower: series[0]!.points[0]!.lowerLimit, upper: series[0]!.points[0]!.upperLimit,
    })).toBe('in-range');
    expect(classifyObservation(series[0]!.points[1]!.value, {
      lower: series[0]!.points[1]!.lowerLimit, upper: series[0]!.points[1]!.upperLimit,
    })).toBe('high');
  });

  it('classifies in-range, low, high, lower-only, upper-only, unavailable, and inequality-safe cases', () => {
    expect(classifyObservation(5, { lower: 3, upper: 7 })).toBe('in-range');
    expect(classifyObservation(2, { lower: 3, upper: 7 })).toBe('low');
    expect(classifyObservation(8, { lower: 3, upper: 7 })).toBe('high');
    expect(classifyObservation(2, { lower: 3, upper: null })).toBe('low');
    expect(classifyObservation(8, { lower: null, upper: 7 })).toBe('high');
    expect(classifyObservation(5, { lower: null, upper: null })).toBe('unknown');
    expect(classifyObservation(0.01, { lower: 5, upper: 10 }, 'lt')).toBe('low');
    expect(classifyObservation(10, { lower: 1, upper: 5 }, 'gt')).toBe('high');
    expect(classifyObservation(3, { lower: 1, upper: 5 }, 'gt')).toBe('unknown');
    expect(classifyObservation(null, { lower: 1, upper: 5 })).toBe('unknown');
  });
});
