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


function drawFullWidthLimit(
  svg: SVGSVGElement,
  which: 'lower' | 'upper',
  y: number,
  value: number,
  unit: string,
  labelExtra: string,
  labelLane: number,
): void {
  const line = svgNode('line', {
    x1: String(LEFT),
    y1: String(y),
    x2: String(RIGHT),
    y2: String(y),
    stroke: RANGE_STROKE,
    'stroke-width': '1.6',
    'stroke-dasharray': '7 5',
    'data-reference': which,
    'data-reference-value': String(value),
    'data-y': String(y),
    'data-report-range': 'true',
    'data-range-band': 'true',
    'data-full-width-limit': 'true',
  });
  svg.append(line);
  // Prefer above the line; if near the top edge, place below so text stays in-plot.
  const preferAbove = y - 5 + labelLane * 12;
  const labelY = preferAbove < TOP + 12
    ? Math.min(BOTTOM - 4, y + 14 + Math.abs(labelLane) * 12)
    : Math.max(TOP + 12, Math.min(BOTTOM - 4, preferAbove));
  const label = svgNode('text', {
    x: String(LEFT + 4),
    y: String(labelY),
    'text-anchor': 'start',
    fill: '#68490b',
    class: 'reference-label',
    'data-reference-label': which,
    'data-report-range-label': 'true',
  });
  label.textContent = `${which === 'lower' ? '下限' : '上限'} ${value} ${unit}${labelExtra}`;
  svg.append(label);
}

function drawMissingLimitNote(
  svg: SVGSVGElement,
  which: 'lower' | 'upper',
  lane: number,
): void {
  // Anchor to the top-right of the plot so notes stay clear of dashed limit labels (usually left).
  const y = TOP + 12 + lane * 14;
  const label = svgNode('text', {
    x: String(RIGHT - 4),
    y: String(y),
    'text-anchor': 'end',
    fill: '#6b7280',
    class: 'reference-missing-label',
    'data-reference-missing': which,
  });
  label.textContent = which === 'lower' ? '报告未提供下限' : '报告未提供上限';
  svg.append(label);
}

/**
 * Draw dashed reference limits across the full time axis.
 * Full-width lines use the most recent report's limits and are labelled as comparison lines.
 * Point abnormal colors still come from each observation's own limits (caller).
 */
function drawRangeVisuals(
  svg: SVGSVGElement,
  plottable: ChartPoint[],
  _xs: number[],
  min: number,
  max: number,
  unit: string,
): void {
  if (!plottable.length) return;

  const display = plottable[plottable.length - 1]!;
  const dateTag = `（最新报告对照线 ${display.date}${display.rangeProvenance === 'migrated-unverified' ? ' · 迁移范围未核实' : ''}）`;

  let lane = 0;
  if (display.lowerLimit !== null) {
    drawFullWidthLimit(
      svg, 'lower', mappedY(display.lowerLimit, min, max), display.lowerLimit, unit, dateTag, 0,
    );
  } else {
    drawMissingLimitNote(svg, 'lower', lane);
    lane += 1;
  }
  if (display.upperLimit !== null) {
    // Offset label up if both limits exist so they don't collide when close.
    const labelLane = display.lowerLimit !== null ? -1 : 0;
    drawFullWidthLimit(
      svg, 'upper', mappedY(display.upperLimit, min, max), display.upperLimit, unit, dateTag, labelLane,
    );
  } else {
    drawMissingLimitNote(svg, 'upper', lane);
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
    pointTitle.textContent = `${point.date} · ${point.rawValue || point.value} ${series.unit} · 当次范围 ${point.lowerLimit ?? '未提供'}–${point.upperLimit ?? '未提供'} · ${point.rangeProvenance} · ${point.laboratory ?? '实验室未填写'} · ${point.method ?? '方法未填写'}`;
    circle.append(pointTitle);
    svg.append(circle);
  });

  const latestStart = Math.max(0, coordinates.length - 3);
  const placedLabels: Array<{ left: number; right: number; top: number; bottom: number }> = [];
  coordinates.slice(latestStart).forEach(({ x, y, point, status }, index, visible) => {
    const originalIndex = latestStart + index;
    const anchor = visible.length === 1 ? 'middle' : index === visible.length - 1 ? 'end' : index === 0 ? 'start' : 'middle';
    const labelText = `${abnormalArrow(status)}${point.rawValue || point.value} · ${fullDateLabel(point.date)}`;
    const width = Math.min(labelText.length * 6.6, 200);
    let left = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2;
    // Keep labels inside plot horizontally.
    if (left < LEFT) left = LEFT;
    if (left + width > RIGHT) left = RIGHT - width;
    const right = left + width;
    const offsets = [-16, 20, -34, 38, -52, 54, -68, 72, -84, 88];
    const candidates = [...new Set(offsets.map((offset) => Math.max(TOP + 14, Math.min(BOTTOM - 8, y + offset))))];
    const labelY = candidates.find((baseline) => {
      const top = baseline - 12;
      const bottom = baseline + 3;
      return placedLabels.every((placed) =>
        right <= placed.left - 2 || left >= placed.right + 2 || bottom <= placed.top || top >= placed.bottom,
      );
    }) ?? candidates[0] ?? y;
    placedLabels.push({ left, right, top: labelY - 12, bottom: labelY + 3 });
    if (Math.abs(labelY - y) > 14) {
      const leader = svgNode('line', {
        x1: String(x),
        y1: String(y),
        x2: String(anchor === 'end' ? right - 2 : anchor === 'start' ? left + 2 : (left + right) / 2),
        y2: String(labelY - 2),
        stroke: statusColor(status),
        'stroke-width': '0.8',
        'stroke-opacity': '0.45',
        class: 'label-leader',
        'data-label-leader': 'true',
      });
      svg.append(leader);
    }
    const label = svgNode('text', {
      x: String(anchor === 'middle' ? (left + right) / 2 : anchor === 'end' ? right : left),
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
  const explanation = svgNode('text', { x: String(LEFT), y: '299', class: 'axis-unit' });
  explanation.textContent = '点颜色按当次范围；最新报告对照线不代表历史范围';
  svg.append(explanation);
  return svg;
}
