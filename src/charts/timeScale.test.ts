import { describe, expect, it } from 'vitest';
import { assignTimeScaleX, dateToMs, fullDateLabel } from './timeScale';

describe('time-scale X mapping', () => {
  it('places irregular dates by elapsed time, not equal index steps', () => {
    // 2024-01-01 → 2024-01-11 (10 days) → 2024-07-09 (~180 days from first)
    const xs = assignTimeScaleX(['2024-01-01', '2024-01-11', '2024-07-09'], 0, 180);
    expect(xs).toHaveLength(3);
    expect(xs[0]).toBe(0);
    expect(xs[2]).toBe(180);
    const earlyGap = xs[1]! - xs[0]!;
    const lateGap = xs[2]! - xs[1]!;
    expect(lateGap).toBeGreaterThan(earlyGap * 5);
    // Not index-equidistant (would be 90 / 90 on a 0–180 scale)
    expect(Math.abs(earlyGap - lateGap)).toBeGreaterThan(50);
  });

  it('keeps every historical point and only jitters same-day multiples', () => {
    const dates = [
      '2024-06-01',
      '2025-01-15', '2025-01-15',
      '2026-03-01',
    ];
    const xs = assignTimeScaleX(dates, 100, 500);
    expect(xs).toHaveLength(4);
    expect(xs[1]).not.toBe(xs[2]);
    expect(Math.abs(xs[2]! - xs[1]!)).toBeGreaterThan(0);
    expect(xs.every((x) => x >= 100 && x <= 500)).toBe(true);
  });

  it('centers a single point and exposes full calendar labels', () => {
    expect(assignTimeScaleX(['2026-05-05'], 10, 90)).toEqual([50]);
    expect(fullDateLabel('2026-09-09')).toBe('2026-09-09');
    expect(dateToMs('2024-06-30')).toBe(Date.parse('2024-06-30T12:00:00Z'));
  });
});
