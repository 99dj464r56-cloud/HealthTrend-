// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { ChartSeries } from './series';
import { renderIndicatorChart } from './chartSvg';

const sample: ChartSeries = {
  indicatorId: 'glucose', nameZh: '空腹血糖', nameEn: 'Fasting glucose', purposeZh: '了解空腹血糖水平', purposeEn: 'Measures fasting blood glucose',
  category: '糖代谢', priority: true, unit: 'mmol/L', referenceRange: { lower: 3.9, upper: 6.1 }, medications: [],
  points: [
    { date: '2024-06-30', value: 5, sourceId: null, pageNumber: null },
    { date: '2025-07-01', value: 3.2, sourceId: null, pageNumber: null },
    { date: '2026-09-09', value: 6.8, sourceId: null, pageNumber: null },
  ],
};

describe('SVG trend chart', () => {
  it('places both labeled range lines at their value-mapped coordinates and draws a connected line', () => {
    const svg = renderIndicatorChart(sample);
    const low = svg.querySelector('[data-reference="lower"]');
    const high = svg.querySelector('[data-reference="upper"]');
    expect(low?.getAttribute('stroke-dasharray')).toBeTruthy();
    expect(high?.getAttribute('stroke-dasharray')).toBeTruthy();
    expect(Number(low?.getAttribute('data-y'))).toBeGreaterThan(Number(high?.getAttribute('data-y')));
    expect(svg.querySelector('[data-reference-label="lower"]')?.textContent).toContain('3.9');
    expect(svg.querySelector('[data-reference-label="upper"]')?.textContent).toContain('6.1');
    expect(svg.querySelector('.trend-line')?.getAttribute('points')?.split(' ').length).toBe(3);
  });

  it('labels the latest three values with year-month dates and flags abnormal points in red with directional arrows', () => {
    const svg = renderIndicatorChart(sample);
    const labels = [...svg.querySelectorAll('.point-label')];
    expect(labels).toHaveLength(3);
    expect(labels.map((label) => label.textContent)).toEqual(['5 · 2024-06', '↓ 3.2 · 2025-07', '↑ 6.8 · 2026-09']);
    expect(svg.querySelectorAll('.abnormal-point')).toHaveLength(2);
    expect(svg.querySelector('[data-category="low"]')?.getAttribute('fill')).toBe('#b42332');
    expect(svg.querySelector('[data-category="high"]')?.getAttribute('fill')).toBe('#b42332');
  });

  it('renders upper-only, lower-only, missing ranges, and one point without dropping the data', () => {
    const onePoint = { ...sample, points: [sample.points[2]], referenceRange: { lower: null, upper: 8 } };
    const svg = renderIndicatorChart(onePoint);
    expect(svg.querySelector('[data-reference="lower"]')).toBeNull();
    expect(svg.querySelector('[data-reference="upper"]')).not.toBeNull();
    expect(svg.querySelectorAll('.data-point')).toHaveLength(1);
    const noRange = renderIndicatorChart({ ...onePoint, referenceRange: { lower: null, upper: null } });
    expect(noRange.querySelector('[data-reference]')).toBeNull();
  });
});
