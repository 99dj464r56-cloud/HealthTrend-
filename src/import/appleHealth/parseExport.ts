import type { AppleHealthKind } from '../../domain/types';
import { parseAppleTimestamp } from './dates';
import { appleHealthFingerprint } from './fingerprint';
import { MAX_APPLE_HEALTH_FILE_BYTES, MAX_APPLE_HEALTH_RECORDS, MAX_APPLE_HEALTH_XML_BYTES } from './limits';
import { parseAppleHealthDocument, AppleHealthXmlError } from './safeXml';
import { SUPPORTED_QUANTITY_TYPE_SET } from './supported';
import { extractAppleHealthXmlFromZip } from './zipRead';

export interface AppleHealthCandidate {
  kind: AppleHealthKind;
  typeIdentifier: string;
  value: number | null;
  unit: string | null;
  startAt: string;
  endAt: string | null;
  localDate: string;
  sourceName: string | null;
  sourceBundleOrDevice: string | null;
  workoutActivityType: string | null;
  duration: number | null;
  durationUnit: string | null;
  importFingerprint: string;
  skipReason: string | null;
}

export interface AppleHealthParseResult {
  candidates: AppleHealthCandidate[];
  skipped: Array<{ reason: string; count: number }>;
  unsupportedTypeCounts: Record<string, number>;
  dateRange: { min: string | null; max: string | null };
  sourceFileName: string;
}

function attr(el: Element, name: string): string | null {
  const value = el.getAttribute(name);
  return value && value.trim() ? value.trim() : null;
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function finishCandidate(partial: Omit<AppleHealthCandidate, 'importFingerprint' | 'skipReason'> & { skipReason?: string | null }): AppleHealthCandidate {
  const skipReason = partial.skipReason ?? null;
  const importFingerprint = appleHealthFingerprint(partial);
  return { ...partial, skipReason, importFingerprint };
}

export function parseAppleHealthXmlText(xmlText: string, sourceFileName: string): AppleHealthParseResult {
  const doc = parseAppleHealthDocument(xmlText);
  const root = doc.documentElement;
  if (!root || root.tagName !== 'HealthData') {
    throw new AppleHealthXmlError('根节点必须是 HealthData（Apple 健康导出）。');
  }

  const candidates: AppleHealthCandidate[] = [];
  const skipMap = new Map<string, number>();
  const unsupportedTypeCounts: Record<string, number> = {};
  let minDate: string | null = null;
  let maxDate: string | null = null;

  const considerDate = (localDate: string): void => {
    if (!minDate || localDate < minDate) minDate = localDate;
    if (!maxDate || localDate > maxDate) maxDate = localDate;
  };

  const records = Array.from(root.getElementsByTagName('Record'));
  const workouts = Array.from(root.getElementsByTagName('Workout'));
  const summaries = Array.from(root.getElementsByTagName('ActivitySummary'));

  // Never read route / ECG content even if present.
  const routes = root.getElementsByTagName('WorkoutRoute').length
    + root.getElementsByTagName('Route').length;
  if (routes > 0) bump(skipMap, '忽略 WorkoutRoute/GPS 路线（不解析、不保存）');

  for (const el of records) {
    if (candidates.length >= MAX_APPLE_HEALTH_RECORDS) {
      bump(skipMap, `超过 ${MAX_APPLE_HEALTH_RECORDS} 条记录上限`);
      break;
    }
    const typeIdentifier = attr(el, 'type') ?? '';
    const startRaw = attr(el, 'startDate');
    if (!startRaw) {
      bump(skipMap, 'Record 缺少 startDate');
      continue;
    }
    const parsedStart = parseAppleTimestamp(startRaw);
    if (!parsedStart) {
      bump(skipMap, 'Record 日期格式无法解析');
      continue;
    }
    considerDate(parsedStart.localDate);
    if (!SUPPORTED_QUANTITY_TYPE_SET.has(typeIdentifier)) {
      unsupportedTypeCounts[typeIdentifier] = (unsupportedTypeCounts[typeIdentifier] ?? 0) + 1;
      bump(skipMap, `不支持的 Record 类型`);
      continue;
    }
    const rawValue = attr(el, 'value');
    const numeric = rawValue === null ? null : Number(rawValue);
    if (rawValue === null || !Number.isFinite(numeric)) {
      bump(skipMap, '非数值或缺失 value 的 Record');
      continue;
    }
    const endRaw = attr(el, 'endDate');
    const parsedEnd = endRaw ? parseAppleTimestamp(endRaw) : null;
    candidates.push(finishCandidate({
      kind: 'sample',
      typeIdentifier,
      value: numeric,
      unit: attr(el, 'unit'),
      startAt: parsedStart.original,
      endAt: parsedEnd?.original ?? endRaw,
      localDate: parsedStart.localDate,
      sourceName: attr(el, 'sourceName'),
      sourceBundleOrDevice: attr(el, 'sourceVersion') ?? attr(el, 'device'),
      workoutActivityType: null,
      duration: null,
      durationUnit: null,
    }));
  }

  for (const el of workouts) {
    if (candidates.length >= MAX_APPLE_HEALTH_RECORDS) break;
    const startRaw = attr(el, 'startDate');
    if (!startRaw) {
      bump(skipMap, 'Workout 缺少 startDate');
      continue;
    }
    const parsedStart = parseAppleTimestamp(startRaw);
    if (!parsedStart) {
      bump(skipMap, 'Workout 日期格式无法解析');
      continue;
    }
    considerDate(parsedStart.localDate);
    const durationRaw = attr(el, 'duration');
    const duration = durationRaw === null ? null : Number(durationRaw);
    const endRaw = attr(el, 'endDate');
    const parsedEnd = endRaw ? parseAppleTimestamp(endRaw) : null;
    candidates.push(finishCandidate({
      kind: 'workout',
      typeIdentifier: 'Workout',
      value: Number.isFinite(duration) ? duration : null,
      unit: attr(el, 'durationUnit'),
      startAt: parsedStart.original,
      endAt: parsedEnd?.original ?? endRaw,
      localDate: parsedStart.localDate,
      sourceName: attr(el, 'sourceName'),
      sourceBundleOrDevice: attr(el, 'sourceVersion') ?? attr(el, 'device'),
      workoutActivityType: attr(el, 'workoutActivityType'),
      duration: Number.isFinite(duration) ? duration : null,
      durationUnit: attr(el, 'durationUnit'),
    }));
  }

  for (const el of summaries) {
    if (candidates.length >= MAX_APPLE_HEALTH_RECORDS) break;
    const dateComponents = attr(el, 'dateComponents'); // YYYY-MM-DD
    if (!dateComponents || !/^\d{4}-\d{2}-\d{2}$/.test(dateComponents)) {
      bump(skipMap, 'ActivitySummary 缺少有效 dateComponents');
      continue;
    }
    considerDate(dateComponents);
    const energy = attr(el, 'activeEnergyBurned');
    const energyNum = energy === null ? null : Number(energy);
    candidates.push(finishCandidate({
      kind: 'activitySummary',
      typeIdentifier: 'ActivitySummary',
      value: energyNum !== null && Number.isFinite(energyNum) ? energyNum : null,
      unit: attr(el, 'activeEnergyBurnedUnit') ?? 'kcal',
      startAt: `${dateComponents} 00:00:00 +0000`,
      endAt: null,
      localDate: dateComponents,
      sourceName: 'ActivitySummary',
      sourceBundleOrDevice: null,
      workoutActivityType: null,
      duration: (() => {
        const minutes = attr(el, 'appleExerciseTime');
        const n = minutes === null ? null : Number(minutes);
        return n !== null && Number.isFinite(n) ? n : null;
      })(),
      durationUnit: 'min',
    }));
  }

  const skipped = [...skipMap.entries()].map(([reason, count]) => ({ reason, count }));
  return {
    candidates,
    skipped,
    unsupportedTypeCounts,
    dateRange: { min: minDate, max: maxDate },
    sourceFileName,
  };
}

export async function loadAppleHealthExportFile(file: File): Promise<AppleHealthParseResult> {
  if (file.size <= 0) throw new AppleHealthXmlError('文件为空。');
  if (file.size > MAX_APPLE_HEALTH_FILE_BYTES) {
    throw new AppleHealthXmlError(`文件不能超过 ${MAX_APPLE_HEALTH_FILE_BYTES / (1024 * 1024)} MiB。`);
  }
  const name = file.name.toLowerCase();
  const isZip = name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
  const isXml = name.endsWith('.xml') || file.type === 'text/xml' || file.type === 'application/xml';
  if (!isZip && !isXml) {
    throw new AppleHealthXmlError('请选择 Apple 健康导出的 export.xml 或包含该文件的 ZIP。');
  }

  if (isZip) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const extracted = await extractAppleHealthXmlFromZip(bytes);
    if (extracted.xmlText.length > MAX_APPLE_HEALTH_XML_BYTES) {
      throw new AppleHealthXmlError('解压后 XML 过大。');
    }
    return parseAppleHealthXmlText(extracted.xmlText, extracted.fileName);
  }

  const xmlText = await file.text();
  return parseAppleHealthXmlText(xmlText, file.name);
}
