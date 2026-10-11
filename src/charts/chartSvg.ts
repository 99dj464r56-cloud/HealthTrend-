import { classifyObservation, type ChartSeries, type ObservationClassification } from './series';

const NS = 'http://www.w3.org/2000/svg';
const WIDTH = 640;
const HEIGHT = 310;
const LEFT = 94;
const RIGHT = 620;
const TOP = 28;
const BOTTOM = 242;
const ABNORMAL = '#b42332';

function svgNode<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function mappedY(value: number, min: number, max: number): number {
  return BOTTOM - ((value - min) / (max - min)) * (BOTTOM - TOP);
}

function mappedX(index: number, length: number): number {
  return length <= 1 ? (LEFT + RIGHT) / 2 : LEFT + (index / (length - 1)) * (RIGHT - LEFT);
}

function monthLabel(date: string): string {
  return date.slice(0, 7);
}

function statusColor(status: ObservationClassification): string {
  return status === 'low' || status === 'high' ? ABNORMAL : '#243746';
}

function abnormalArrow(status: ObservationClassification): string {
  return status === 'low' ? '↓ ' : status === 'high' ? '↑ ' : '';
}

export function renderIndicatorChart(series: ChartSeries): SVGSVGElement {
  const svg = svgNode('svg', {
    class: 'indicator-chart', viewBox: `0 0 ${WIDTH} ${HEIGHT}`, role: 'img',
    'aria-label': `${series.nameZh} / ${series.nameEn} trend chart`, preserveAspectRatio: 'xMidYMid meet',
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

  const values = [
    ...series.points.map((point) => point.value),
    ...(series.referenceRange.lower === null ? [] : [series.referenceRange.lower]),
    ...(series.referenceRange.upper === null ? [] : [series.referenceRange.upper]),
  ];
  let min = Math.min(...values);
  let max = Math.max(...values);
  const span = max - min;
  const padding = span === 0 ? Math.max(Math.abs(max) * 0.12, 1) : span * 0.14;
  min -= padding;
  max += padding;

  const grid = svgNode('line', { x1: String(LEFT), y1: String(BOTTOM), x2: String(RIGHT), y2: String(BOTTOM), stroke: '#aab6c0', 'stroke-width': '1' });
  svg.append(grid);

  for (const [which, value] of [['lower', series.referenceRange.lower], ['upper', series.referenceRange.upper]] as const) {
    if (value === null) continue;
    const y = mappedY(value, min, max);
    const line = svgNode('line', {
      x1: String(LEFT), y1: String(y), x2: String(RIGHT), y2: String(y),
      stroke: '#9a6b0d', 'stroke-width': '1.4', 'stroke-dasharray': '6 5',
      'data-reference': which, 'data-reference-value': String(value), 'data-y': String(y),
    });
    const label = svgNode('text', {
      x: '8', y: String(y - 4), 'text-anchor': 'start', fill: '#68490b', class: 'reference-label',
      'data-reference-label': which,
    });
    label.textContent = `${which === 'lower' ? '下限' : '上限'} ${value} ${series.unit}`;
    svg.append(line, label);
  }

  const coordinates = series.points.map((point, index) => ({
    x: mappedX(index, series.points.length), y: mappedY(point.value, min, max), point,
    status: classifyObservation(point.value, series.referenceRange),
  }));
  if (coordinates.length > 1) {
    const line = svgNode('polyline', {
      class: 'trend-line', points: coordinates.map(({ x, y }) => `${x},${y}`).join(' '),
      fill: 'none', stroke: '#1769aa', 'stroke-width': '2.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    });
    svg.append(line);
  }

  coordinates.forEach(({ x, y, point, status }) => {
    const color = statusColor(status);
    const circle = svgNode('circle', {
      cx: String(x), cy: String(y), r: status === 'low' || status === 'high' ? '5.2' : '4.2',
      fill: color, class: `data-point${status === 'low' || status === 'high' ? ' abnormal-point' : ''}`,
      'data-category': status, 'data-date': point.date, 'data-value': String(point.value),
    });
    const pointTitle = svgNode('title');
    pointTitle.textContent = `${point.date} · ${point.value} ${series.unit}`;
    circle.append(pointTitle);
    svg.append(circle);
  });

  const latestStart = Math.max(0, coordinates.length - 3);
  coordinates.slice(latestStart).forEach(({ x, y, point, status }, index, visible) => {
    const originalIndex = latestStart + index;
    const anchor = visible.length === 1 ? 'middle' : index === visible.length - 1 ? 'end' : index === 0 ? 'start' : 'middle';
    const offset = index % 2 === 0 ? -13 : 20;
    const label = svgNode('text', {
      x: String(x), y: String(Math.max(TOP + 12, Math.min(BOTTOM - 5, y + offset))),
      'text-anchor': anchor, fill: statusColor(status), class: `point-label${status === 'low' || status === 'high' ? ' abnormal-label' : ''}`,
      'data-date': point.date, 'data-index': String(originalIndex),
    });
    label.textContent = `${abnormalArrow(status)}${point.value} · ${monthLabel(point.date)}`;
    svg.append(label);
  });

  const ticks = [...new Set([0, Math.floor((coordinates.length - 1) / 2), coordinates.length - 1])];
  ticks.forEach((index) => {
    const tick = svgNode('text', {
      x: String(mappedX(index, coordinates.length)), y: '266', 'text-anchor': index === 0 ? 'start' : index === coordinates.length - 1 ? 'end' : 'middle',
      class: 'axis-date',
    });
    tick.textContent = monthLabel(series.points[index].date);
    svg.append(tick);
  });
  const yLabel = svgNode('text', { x: '8', y: '299', class: 'axis-unit' });
  yLabel.textContent = series.unit;
  svg.append(yLabel);
  return svg;
}
