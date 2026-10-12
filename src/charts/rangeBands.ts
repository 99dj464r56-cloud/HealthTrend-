import type { ChartPoint } from './series';

export interface RangeBandSegment {
  startIndex: number;
  endIndex: number;
  lower: number | null;
  upper: number | null;
  /** True when consecutive points share lab+method+identical limits (length ≥ 2). */
  connectBand: boolean;
  laboratory: string | null;
  method: string | null;
}

function labMethodKey(point: ChartPoint): string {
  return `${point.laboratory ?? ''}\u0000${point.method ?? ''}`;
}

function rangeKey(point: ChartPoint): string {
  return `${point.lowerLimit}\u0000${point.upperLimit}`;
}

function hasAnyLimit(point: ChartPoint): boolean {
  return point.lowerLimit !== null || point.upperLimit !== null;
}

/**
 * Walk plottable points in order and group consecutive runs that share laboratory,
 * method, and identical reference limits. Bands connect only inside such runs;
 * a lab/method (or limit) change breaks the band.
 */
export function buildRangeBandSegments(points: readonly ChartPoint[]): RangeBandSegment[] {
  const segments: RangeBandSegment[] = [];
  let start = 0;
  while (start < points.length) {
    if (!hasAnyLimit(points[start]!)) {
      start += 1;
      continue;
    }
    let end = start;
    const key = `${labMethodKey(points[start]!)}|${rangeKey(points[start]!)}`;
    while (
      end + 1 < points.length
      && hasAnyLimit(points[end + 1]!)
      && `${labMethodKey(points[end + 1]!)}|${rangeKey(points[end + 1]!)}` === key
    ) {
      end += 1;
    }
    const head = points[start]!;
    segments.push({
      startIndex: start,
      endIndex: end,
      lower: head.lowerLimit,
      upper: head.upperLimit,
      connectBand: end > start,
      laboratory: head.laboratory,
      method: head.method,
    });
    start = end + 1;
  }
  return segments;
}
