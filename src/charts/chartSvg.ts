import { buildRangeBandSegments } from './rangeBands';
import { classifyObservation, type ChartPoint, type ChartSeries, type ObservationClassification } from './series';
import { assignTimeScaleX, dateToMs, fullDateLabel } from './timeScale';

const NS = 'http://www.w3.org/2000/svg';
const WIDTH = 640;
const HEIGHT = 310;
const LEFT = 94;
const RIGHT = 620;
const TOP = 28;
const BOTTOM = 242;
const ABNORMAL = '#b42332';
const RANGE_STROKE = '#9a6b0d';
const POINT_TICK_HALF = 9;

function svgNode<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function mappedY(value: number, min: number, max: number): number {
  return BOTTOM - ((value - min) / (max - min)) * (BOTTOM - TOP);
}

function statusColor(status: ObservationClassification): string {
  return status === 'low' || status === 'high' ? ABNORMAL : '#243746';
}

function abnormalArrow(status: ObservationClassification): string {
  return status === 'low' ? '↓ ' : status === 'high' ? '↑ ' : '';
}


function drawRegimenBands(
  svg: SVGSVGElement,
  series: ChartSeries,
  plotDates: string[],
): void {
  if (!series.medications.length || !plotDates.length) return;
  const minMs = Math.min(...plotDates.map(dateToMs));
  const maxMs = Math.max(...plotDates.map(dateToMs));
  const span = Math.max(maxMs - minMs, 1);
  const xForDate = (date: string | null, fallback: 'left' | 'right'): number => {
    if (!date) return fallback === 'left' ? LEFT : RIGHT;
    const ms = dateToMs(date);
    return LEFT + ((ms - minMs) / span) * (RIGHT - LEFT);
  };
  series.medications.forEach((period, index) => {
    if (!period.startDate && !period.endDate) return;
    const x1 = Math.max(LEFT, Math.min(RIGHT, xForDate(period.startDate, 'left')));
    const x2 = Math.max(LEFT, Math.min(RIGHT, xForDate(period.endDate, 'right')));
    const left = Math.min(x1, x2);
    const width = Math.max(4, Math.abs(x2 - x1));
    const y = TOP + 2 + (index % 3) * 6;
    const band = svgNode('rect', {
      x: String(left),
      y: String(y),
      width: String(width),
      height: '4',
      fill: '#9aa8b5',
      opacity: '0.35',
      'data-regimen-band': 'true',
      'data-stage-id': period.id,
      'data-neutral': 'true',
    });
    const title = svgNode('title');
    title.textContent = `用药阶段（中性时间标记，不表示因果）: ${period.nameZh} / ${period.nameEn} · ${period.summary}`;
    band.append(title);
    svg.append(band);
  });
}

function appendRangeMark(
  svg: SVGSVGElement,
  which: 'lower' | 'upper',
  x: number,
  y: number,
  value: number,
  unit: string,
  options: { band?: boolean; x2?: number },
): void {
  const x1 = options.band && options.x2 !== undefined ? x : x - POINT_TICK_HALF;
  const x2 = options.band && options.x2 !== undefined ? options.x2 : x + POINT_TICK_HALF;
  const line = svgNode('line', {
    x1: String(x1),
    y1: String(y),
    x2: String(x2),
    y2: String(y),
    stroke: RANGE_STROKE,
    'stroke-width': options.band ? '1.4' : '1.2',
    'stroke-dasharray': '6 5',
    'data-reference': which,
    'data-reference-value': String(value),
    'data-y': String(y),
    'data-report-range': 'true',
    ...(options.band ? { 'data-range-band': 'true' } : { 'data-point-range': 'true' }),
  });
  svg.append(line);
  if (options.band) {
    const label = svgNode('text', {
      x: String(x1 + 2),
      y: String(y - 4),
      'text-anchor': 'start',
      fill: '#68490b',
      class: 'reference-label',
      'data-reference-label': which,
      'data-report-range-label': 'true',
    });
    label.textContent = `${which === 'lower' ? '下限' : '上限'} ${value} ${unit} · 该次报告参考范围`;
    svg.append(label);
  }
}

function drawRangeVisuals(
  svg: SVGSVGElement,
  plottable: ChartPoint[],
  xs: number[],
  min: number,
  max: number,
  unit: string,
): void {
  const segments = buildRangeBandSegments(plottable);

  // Per-point ticks at every measurement that has limits (default view).
  plottable.forEach((point, index) => {
    const x = xs[index]!;
    if (point.lowerLimit !== null) {
      appendRangeMark(svg, 'lower', x, mappedY(point.lowerLimit, min, max), point.lowerLimit, unit, {});
    }
    if (point.upperLimit !== null) {
      appendRangeMark(svg, 'upper', x, mappedY(point.upperLimit, min, max), point.upperLimit, unit, {});
    }
  });

  // Connect into a band only when lab+method+limits stay consistent across consecutive points.
  for (const segment of segments) {
    if (!segment.connectBand) continue;
    const x1 = xs[segment.startIndex]!;
    const x2 = xs[segment.endIndex]!;
    if (segment.lower !== null) {
      appendRangeMark(svg, 'lower', x1, mappedY(segment.lower, min, max), segment.lower, unit, { band: true, x2 });
    }
    if (segment.upper !== null) {
      appendRangeMark(svg, 'upper', x1, mappedY(segment.upper, min, max), segment.upper, unit, { band: true, x2 });
    }
  }
}

export function renderIndicatorChart(series: ChartSeries): SVGSVGElement {
  const svg = svgNode('svg', {
    class: 'indicator-chart',
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
    role: 'img',
    'aria-label': `${series.nameZh} / ${series.nameEn} trend chart`,
    preserveAspectRatio: 'xMidYMid meet',
    'data-x-scale': 'time',
  });
  const title = svgNode('title');
  title.textContent = `${series.nameZh} / ${series.nameEn} · ${series.unit}`;
  svg.append(title);

  if (!series.points.length) {
    const empty = svgNode('text', { x: String(WIDTH / 2), y: '150', 'text-anchor': 'middle', class: 'chart-empty' });
    empty.textContent = '暂无已录入的检查数值 / No measurements';
    svg.append(empty);
    return svg;
  }

  const plottable = series.points.filter((point) => point.value !== null);
  if (!plottable.length) {
    const empty = svgNode('text', { x: String(WIDTH / 2), y: '150', 'text-anchor': 'middle', class: 'chart-empty' });
    empty.textContent = '暂无已录入的检查数值 / No measurements';
    svg.append(empty);
    return svg;
  }

  const plotValues = plottable.map((point) => point.value as number);
  const limitValues = plottable.flatMap((point) => [
    ...(point.lowerLimit === null ? [] : [point.lowerLimit]),
    ...(point.upperLimit === null ? [] : [point.upperLimit]),
  ]);
  const values = [...plotValues, ...limitValues];
  let min = Math.min(...values);
  let max = Math.max(...values);
  const span = max - min;
  const padding = span === 0 ? Math.max(Math.abs(max) * 0.12, 1) : span * 0.14;
  min -= padding;
  max += padding;

  const grid = svgNode('line', {
    x1: String(LEFT), y1: String(BOTTOM), x2: String(RIGHT), y2: String(BOTTOM),
    stroke: '#aab6c0', 'stroke-width': '1',
  });
  svg.append(grid);

  const xs = assignTimeScaleX(plottable.map((point) => point.date), LEFT, RIGHT);
  drawRegimenBands(svg, series, plottable.map((point) => point.date));
  drawRangeVisuals(svg, plottable, xs, min, max, series.unit);

  const coordinates = plottable.map((point, index) => ({
    x: xs[index]!,
    y: mappedY(point.value as number, min, max),
    point,
    status: classifyObservation(
      point.value,
      { lower: point.lowerLimit, upper: point.upperLimit },
      point.comparator,
    ),
  }));

  if (coordinates.length > 1) {
    const line = svgNode('polyline', {
      class: 'trend-line',
      points: coordinates.map(({ x, y }) => `${x},${y}`).join(' '),
      fill: 'none',
      stroke: '#1769aa',
      'stroke-width': '2.5',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'data-trend': 'measured-values',
    });
    svg.append(line);
  }

  coordinates.forEach(({ x, y, point, status }) => {
    const color = statusColor(status);
    const isInequality = point.comparator !== 'none';
    const circle = svgNode('circle', {
      cx: String(x),
      cy: String(y),
      r: status === 'low' || status === 'high' ? '5.2' : '4.2',
      fill: isInequality ? '#ffffff' : color,
      stroke: color,
      'stroke-width': isInequality ? '2' : '0',
      class: `data-point${status === 'low' || status === 'high' ? ' abnormal-point' : ''}${isInequality ? ' inequality-point' : ''}`,
      'data-category': status,
      'data-date': point.date,
      'data-value': String(point.value ?? point.rawValue),
      'data-raw-value': point.rawValue,
      'data-comparator': point.comparator,
      'data-x': String(x),
    });
    const pointTitle = svgNode('title');
    pointTitle.textContent = `${point.date} · ${point.rawValue || point.value} ${series.unit}`;
    circle.append(pointTitle);
    svg.append(circle);
  });

  const latestStart = Math.max(0, coordinates.length - 3);
  const placedLabels: Array<{ left: number; right: number; top: number; bottom: number }> = [];
  coordinates.slice(latestStart).forEach(({ x, y, point, status }, index, visible) => {
    const originalIndex = latestStart + index;
    const anchor = visible.length === 1 ? 'middle' : index === visible.length - 1 ? 'end' : index === 0 ? 'start' : 'middle';
    const labelText = `${abnormalArrow(status)}${point.rawValue || point.value} · ${fullDateLabel(point.date)}`;
    const width = labelText.length * 7.2;
    const left = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2;
    const right = left + width;
    const offsets = [-13, 22, -32, 41, -51, 60, -70, 78];
    const candidates = [...new Set(offsets.map((offset) => Math.max(TOP + 12, Math.min(BOTTOM - 5, y + offset))))];
    const labelY = candidates.find((baseline) => {
      const top = baseline - 13;
      const bottom = baseline + 2;
      return placedLabels.every((placed) =>
        right <= placed.left || left >= placed.right || bottom <= placed.top || top >= placed.bottom,
      );
    }) ?? candidates[0] ?? y;
    placedLabels.push({ left, right, top: labelY - 13, bottom: labelY + 2 });
    const label = svgNode('text', {
      x: String(x),
      y: String(labelY),
      'text-anchor': anchor,
      fill: statusColor(status),
      class: `point-label${status === 'low' || status === 'high' ? ' abnormal-label' : ''}`,
      'data-date': point.date,
      'data-index': String(originalIndex),
    });
    label.textContent = labelText;
    svg.append(label);
  });

  const tickIndices = [...new Set([0, Math.floor((coordinates.length - 1) / 2), coordinates.length - 1])];
  tickIndices.forEach((index) => {
    const x = coordinates[index]!.x;
    const tick = svgNode('text', {
      x: String(x),
      y: '266',
      'text-anchor': index === 0 ? 'start' : index === coordinates.length - 1 ? 'end' : 'middle',
      class: 'axis-date',
      'data-axis-date': coordinates[index]!.point.date,
    });
    tick.textContent = fullDateLabel(coordinates[index]!.point.date);
    svg.append(tick);
  });
  const yLabel = svgNode('text', { x: '8', y: '299', class: 'axis-unit' });
  yLabel.textContent = series.unit;
  svg.append(yLabel);
  return svg;
}
