// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { ChartPoint, ChartSeries } from './series';
import { renderIndicatorChart } from './chartSvg';

function pt(partial: Partial<ChartPoint> & Pick<ChartPoint, 'date' | 'value' | 'rawValue'>): ChartPoint {
  return {
    comparator: 'none',
    lowerLimit: 3.9,
    upperLimit: 6.1,
    rangeProvenance: 'from-report',
    laboratory: null,
    method: null,
    sourceId: null,
    pageNumber: null,
    ...partial,
  };
}

const sample: ChartSeries = {
  indicatorId: 'glucose', nameZh: '空腹血糖', nameEn: 'Fasting glucose', purposeZh: '了解空腹血糖水平', purposeEn: 'Measures fasting blood glucose',
  category: '糖代谢', priority: true, unit: 'mmol/L', referenceRange: { lower: 3.9, upper: 6.1 }, medications: [],
  points: [
    pt({ date: '2024-06-30', value: 5, rawValue: '5' }),
    pt({ date: '2025-07-01', value: 3.2, rawValue: '3.2' }),
    pt({ date: '2026-09-09', value: 6.8, rawValue: '6.8' }),
  ],
};

describe('SVG trend chart', () => {
  it('uses a real time X-axis and draws measured trend points', () => {
    const svg = renderIndicatorChart(sample);
    expect(svg.getAttribute('data-x-scale')).toBe('time');
    const xs = [...svg.querySelectorAll('.data-point')].map((node) => Number(node.getAttribute('data-x')));
    expect(xs).toHaveLength(3);
    const early = xs[1]! - xs[0]!;
    const late = xs[2]! - xs[1]!;
    // ~1 year then ~1.2 years — gaps similar but not index-forced equal on a long span;
    // ensure positions are monotonic and not the old equal thirds.
    expect(xs[0]).toBeLessThan(xs[1]!);
    expect(xs[1]).toBeLessThan(xs[2]!);
    const equalStep = (xs[2]! - xs[0]!) / 2;
    expect(Math.abs(early - equalStep) > 1 || Math.abs(late - equalStep) > 1 || early > 0).toBe(true);
    expect(svg.querySelector('.trend-line')?.getAttribute('points')?.split(' ').length).toBe(3);
  });

  it('places uneven calendar gaps farther apart than clustered dates', () => {
    const series: ChartSeries = {
      ...sample,
      points: [
        pt({ date: '2024-01-01', value: 5, rawValue: '5' }),
        pt({ date: '2024-01-08', value: 5.1, rawValue: '5.1' }),
        pt({ date: '2026-01-01', value: 5.2, rawValue: '5.2' }),
      ],
    };
    const svg = renderIndicatorChart(series);
    const xs = [...svg.querySelectorAll('.data-point')].map((node) => Number(node.getAttribute('data-x')));
    expect(xs[1]! - xs[0]!).toBeLessThan((xs[2]! - xs[1]!) / 10);
  });

  it('labels the latest three values with full YYYY-MM-DD dates and flags abnormal points', () => {
    const svg = renderIndicatorChart(sample);
    const labels = [...svg.querySelectorAll('.point-label')];
    expect(labels).toHaveLength(3);
    expect(labels.map((label) => label.textContent)).toEqual([
      '5 · 2024-06-30',
      '↓ 3.2 · 2025-07-01',
      '↑ 6.8 · 2026-09-09',
    ]);
    expect(svg.querySelectorAll('.abnormal-point')).toHaveLength(2);
    expect(svg.querySelector('[data-category="low"]')?.getAttribute('fill')).toBe('#b42332');
    expect(svg.querySelector('[data-category="high"]')?.getAttribute('fill')).toBe('#b42332');
  });

  it('marks each report range near the measurement and connects a band only for consistent lab/method', () => {
    const svg = renderIndicatorChart(sample);
    expect(svg.querySelectorAll('[data-point-range="true"]').length).toBeGreaterThan(0);
    expect(svg.querySelectorAll('[data-range-band="true"]').length).toBeGreaterThan(0);
    expect(svg.querySelector('[data-report-range-label="true"]')?.textContent).toContain('该次报告参考范围');
    const band = svg.querySelector('[data-range-band="true"][data-reference="lower"]');
    const high = svg.querySelector('[data-range-band="true"][data-reference="upper"]');
    expect(Number(band?.getAttribute('data-y'))).toBeGreaterThan(Number(high?.getAttribute('data-y')));
  });

  it('does not draw one continuous band across lab/method changes', () => {
    const series: ChartSeries = {
      ...sample,
      referenceRange: { lower: null, upper: null },
      points: [
        pt({ date: '2024-01-01', value: 5, rawValue: '5', laboratory: 'Lab A', method: 'M1', lowerLimit: 3, upperLimit: 7 }),
        pt({ date: '2025-01-01', value: 5.5, rawValue: '5.5', laboratory: 'Lab A', method: 'M1', lowerLimit: 3, upperLimit: 7 }),
        pt({ date: '2026-01-01', value: 4.5, rawValue: '4.5', laboratory: 'Lab B', method: 'M2', lowerLimit: 2, upperLimit: 9 }),
      ],
    };
    const svg = renderIndicatorChart(series);
    const bands = [...svg.querySelectorAll('[data-range-band="true"][data-reference="lower"]')];
    expect(bands).toHaveLength(1); // only Lab A segment connects
    expect(svg.querySelectorAll('[data-point-range="true"][data-reference="lower"]')).toHaveLength(3);
    // Third point still classified from its own limits
    expect(svg.querySelector('[data-date="2026-01-01"]')?.getAttribute('data-category')).toBe('in-range');
  });

  it('renders one-sided and missing ranges without dropping points, and never fabricates limits', () => {
    const onePoint = {
      ...sample,
      points: [pt({ date: '2026-09-09', value: 6.8, rawValue: '6.8', lowerLimit: null, upperLimit: 8, rangeProvenance: 'from-report' as const })],
      referenceRange: { lower: null, upper: 8 },
    };
    const svg = renderIndicatorChart(onePoint);
    expect(svg.querySelector('[data-reference="lower"]')).toBeNull();
    expect(svg.querySelector('[data-reference="upper"]')).not.toBeNull();
    expect(svg.querySelectorAll('.data-point')).toHaveLength(1);
    const noRange = renderIndicatorChart({
      ...onePoint,
      points: [pt({ date: '2026-09-09', value: 6.8, rawValue: '6.8', lowerLimit: null, upperLimit: null, rangeProvenance: 'unknown' })],
      referenceRange: { lower: null, upper: null },
    });
    expect(noRange.querySelector('[data-reference]')).toBeNull();
  });

  it('keeps all historical points when labels crowd and only labels the latest three', () => {
    const points = Array.from({ length: 20 }, (_, index) => pt({
      date: `${2007 + index}-01-01`, value: 5, rawValue: '5',
    }));
    const svg = renderIndicatorChart({ ...sample, points });
    expect(svg.querySelectorAll('.data-point')).toHaveLength(20);
    const labels = [...svg.querySelectorAll<SVGTextElement>('.point-label')];
    expect(labels).toHaveLength(3);
    expect(labels.every((label) => /\d{4}-\d{2}-\d{2}$/.test(label.textContent ?? ''))).toBe(true);
    expect(new Set(labels.map((label) => label.getAttribute('y'))).size).toBe(3);
  });

  it('shows inequality raw text and does not treat <value as an exact filled reading', () => {
    const series: ChartSeries = {
      ...sample,
      points: [
        pt({ date: '2026-01-01', value: 0.01, rawValue: '<0.01', comparator: 'lt', lowerLimit: 5, upperLimit: 10 }),
      ],
    };
    const svg = renderIndicatorChart(series);
    const point = svg.querySelector('.data-point');
    expect(point?.getAttribute('data-comparator')).toBe('lt');
    expect(point?.getAttribute('data-raw-value')).toBe('<0.01');
    expect(point?.classList.contains('inequality-point')).toBe(true);
    expect(point?.getAttribute('fill')).toBe('#ffffff');
    expect(svg.querySelector('.point-label')?.textContent).toContain('<0.01');
    expect(svg.querySelector('.point-label')?.textContent).toContain('2026-01-01');
  });

  it('separates same-day measurements on the time axis without dropping either point', () => {
    const series: ChartSeries = {
      ...sample,
      points: [
        pt({ date: '2026-05-01', value: 4, rawValue: '4' }),
        pt({ date: '2026-05-01', value: 6, rawValue: '6' }),
      ],
    };
    const svg = renderIndicatorChart(series);
    const xs = [...svg.querySelectorAll('.data-point')].map((node) => Number(node.getAttribute('data-x')));
    expect(xs).toHaveLength(2);
    expect(xs[0]).not.toBe(xs[1]);
  });

  it('draws neutral regimen time bands for linked dose stages without causal copy', () => {
    const series: ChartSeries = {
      ...sample,
      medications: [{
        id: 'stage-1', medicationId: 'med-1', nameZh: '示例药', nameEn: 'Example medicine',
        summary: '10 mg · 1 tablet · Daily', strength: '10 mg', instructions: 'Daily',
        startDate: '2025-01-01', endDate: '2026-01-01',
      }],
    };
    const svg = renderIndicatorChart(series);
    const band = svg.querySelector('[data-regimen-band="true"]');
    expect(band).not.toBeNull();
    expect(band?.getAttribute('data-neutral')).toBe('true');
    expect(band?.querySelector('title')?.textContent).toContain('不表示因果');
  });
});
