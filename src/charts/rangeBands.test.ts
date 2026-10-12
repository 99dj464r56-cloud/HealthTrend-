import { describe, expect, it } from 'vitest';
import { buildRangeBandSegments } from './rangeBands';
import type { ChartPoint } from './series';

function point(partial: Partial<ChartPoint> & Pick<ChartPoint, 'date' | 'value'>): ChartPoint {
  return {
    rawValue: String(partial.value ?? ''),
    comparator: 'none',
    lowerLimit: 3,
    upperLimit: 7,
    rangeProvenance: 'from-report',
    laboratory: 'Lab A',
    method: 'method-1',
    sourceId: null,
    pageNumber: null,
    ...partial,
  };
}

describe('range band segmentation', () => {
  it('connects a band only while laboratory, method, and limits stay identical', () => {
    const points = [
      point({ date: '2024-01-01', value: 5, laboratory: 'Lab A', method: 'EIA' }),
      point({ date: '2025-01-01', value: 5.2, laboratory: 'Lab A', method: 'EIA' }),
      point({ date: '2026-01-01', value: 5.1, laboratory: 'Lab B', method: 'EIA', lowerLimit: 2, upperLimit: 8 }),
    ];
    const segments = buildRangeBandSegments(points);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ startIndex: 0, endIndex: 1, connectBand: true, lower: 3, upper: 7 });
    expect(segments[1]).toMatchObject({ startIndex: 2, endIndex: 2, connectBand: false, laboratory: 'Lab B' });
  });

  it('breaks the band when method changes even if limits look the same', () => {
    const points = [
      point({ date: '2024-01-01', value: 4, method: 'old' }),
      point({ date: '2025-01-01', value: 4.5, method: 'new' }),
    ];
    const segments = buildRangeBandSegments(points);
    expect(segments).toEqual([
      expect.objectContaining({ startIndex: 0, endIndex: 0, connectBand: false }),
      expect.objectContaining({ startIndex: 1, endIndex: 1, connectBand: false }),
    ]);
  });

  it('skips observations without limits and does not invent a global band', () => {
    const points = [
      point({ date: '2024-01-01', value: 4, lowerLimit: null, upperLimit: null, rangeProvenance: 'unknown' }),
      point({ date: '2025-01-01', value: 5 }),
      point({ date: '2026-01-01', value: 6 }),
    ];
    expect(buildRangeBandSegments(points)).toEqual([
      expect.objectContaining({ startIndex: 1, endIndex: 2, connectBand: true }),
    ]);
  });
});
