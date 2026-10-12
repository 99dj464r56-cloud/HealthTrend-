// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAppleTimestamp } from './dates';
import { appleHealthFingerprint } from './fingerprint';
import { MAX_APPLE_HEALTH_ZIP_ENTRIES } from './limits';
import { loadAppleHealthExportFile, parseAppleHealthXmlText } from './parseExport';
import { buildAppleHealthPreview, previewRowsToRecords } from './preview';
import { AppleHealthXmlError, sanitizeAppleHealthXml } from './safeXml';
import { extractAppleHealthXmlFromZip } from './zipRead';
import type { AppleHealthRecord } from '../../domain/types';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../../../tests/fixtures/apple-health');

function readFixture(name: string): string {
  return readFileSync(join(fixtureDir, name), 'utf8');
}

/** Minimal store-method ZIP with one entry (no compression). */
function buildStoreZip(entries: Array<{ name: string; content: Uint8Array }>): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const encoder = new TextEncoder();

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const local = new Uint8Array(30 + nameBytes.length + entry.content.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, 0, true); // method store
    lv.setUint32(18, entry.content.length, true);
    lv.setUint32(22, entry.content.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(entry.content, 30 + nameBytes.length);
    parts.push(local);

    const cen = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(20, entry.content.length, true);
    cv.setUint32(24, entry.content.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cen.set(nameBytes, 46);
    central.push(cen);
    offset += local.length;
  }

  const centralOffset = offset;
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralOffset, true);

  const total = offset + centralSize + 22;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) { out.set(p, pos); pos += p.length; }
  for (const c of central) { out.set(c, pos); pos += c.length; }
  out.set(eocd, pos);
  return out;
}

function fileFromBytes(bytes: Uint8Array, name: string, type: string): File {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new File([copy.buffer], name, { type });
}

describe('Apple Health dates', () => {
  it('keeps local calendar day from offset without UTC jump', () => {
    const parsed = parseAppleTimestamp('2026-01-15 00:30:00 +0800');
    expect(parsed?.localDate).toBe('2026-01-15');
    expect(parsed?.original).toBe('2026-01-15 00:30:00 +0800');
    // Same instant near UTC midnight previous day still reports local date 15
    const nearMidnight = parseAppleTimestamp('2026-01-15 00:05:00 +0800');
    expect(nearMidnight?.localDate).toBe('2026-01-15');
    expect(new Date(nearMidnight!.utcMs).toISOString().startsWith('2026-01-14')).toBe(true);
  });
});

describe('Apple Health safe XML', () => {
  it('accepts Apple-style local DOCTYPE after stripping', () => {
    const xml = readFixture('synthetic-export.xml');
    const cleaned = sanitizeAppleHealthXml(xml);
    expect(cleaned).not.toMatch(/<!DOCTYPE/i);
    const result = parseAppleHealthXmlText(xml, 'synthetic-export.xml');
    expect(result.candidates.length).toBeGreaterThanOrEqual(4);
  });

  it('rejects external entity SYSTEM declarations', () => {
    const xml = readFixture('malicious-xxe.xml');
    expect(() => sanitizeAppleHealthXml(xml)).toThrow(AppleHealthXmlError);
    expect(() => parseAppleHealthXmlText(xml, 'malicious-xxe.xml')).toThrow(/外部实体|SYSTEM/i);
  });
});

describe('Apple Health parse + preview', () => {
  it('parses Record, Workout, ActivitySummary and counts unsupported types', () => {
    const result = parseAppleHealthXmlText(readFixture('synthetic-export.xml'), 'synthetic-export.xml');
    const kinds = new Set(result.candidates.map((c) => c.kind));
    expect(kinds.has('sample')).toBe(true);
    expect(kinds.has('workout')).toBe(true);
    expect(kinds.has('activitySummary')).toBe(true);
    expect(result.unsupportedTypeCounts.HKQuantityTypeIdentifierDietaryWater).toBe(1);
    expect(result.skipped.some((s) => /WorkoutRoute|GPS/i.test(s.reason))).toBe(true);
    expect(result.dateRange.min).toBe('2026-01-15');
    expect(result.dateRange.max).toBe('2026-01-16');
  });

  it('fingerprint is stable and idempotent; similar-but-different is conflict', () => {
    const result = parseAppleHealthXmlText(readFixture('synthetic-export.xml'), 'x.xml');
    const step = result.candidates.find((c) => c.typeIdentifier.includes('StepCount') && c.localDate === '2026-01-15')!;
    const fp = appleHealthFingerprint(step);
    expect(fp).toBe(step.importFingerprint);

    const existing: AppleHealthRecord[] = [{
      id: 'ah-1',
      kind: step.kind,
      typeIdentifier: step.typeIdentifier,
      value: step.value,
      unit: step.unit,
      startAt: step.startAt,
      endAt: step.endAt,
      localDate: step.localDate,
      sourceName: step.sourceName,
      sourceBundleOrDevice: step.sourceBundleOrDevice,
      workoutActivityType: null,
      duration: null,
      durationUnit: null,
      importFingerprint: step.importFingerprint,
      sourceFileId: 'src-1',
      importedAt: '2026-03-01T00:00:00.000Z',
      confirmed: true,
    }];

    const previewDup = buildAppleHealthPreview(result, existing, {
      kinds: new Set(['sample', 'workout', 'activitySummary']),
      typeIdentifiers: null,
      dateFrom: null,
      dateTo: null,
    });
    expect(previewDup.duplicate).toBeGreaterThanOrEqual(1);

    const conflictExisting: AppleHealthRecord[] = [{
      ...existing[0]!,
      id: 'ah-2',
      value: 9999,
      importFingerprint: 'different-fp',
    }];
    const previewConflict = buildAppleHealthPreview(result, conflictExisting, {
      kinds: new Set(['sample', 'workout', 'activitySummary']),
      typeIdentifiers: null,
      dateFrom: null,
      dateTo: null,
    });
    expect(previewConflict.conflict).toBeGreaterThanOrEqual(1);

    const filtered = buildAppleHealthPreview(result, [], {
      kinds: new Set(['sample']),
      typeIdentifiers: null,
      dateFrom: '2026-01-16',
      dateTo: '2026-01-16',
    });
    expect(filtered.filtered).toBeGreaterThan(0);
    expect(filtered.willImport).toBeGreaterThanOrEqual(1);
  });

  it('previewRowsToRecords only maps will-import (and optional conflicts)', () => {
    const result = parseAppleHealthXmlText(readFixture('synthetic-export.xml'), 'x.xml');
    const preview = buildAppleHealthPreview(result, [], {
      kinds: new Set(['sample', 'workout', 'activitySummary']),
      typeIdentifiers: null,
      dateFrom: null,
      dateTo: null,
    });
    const records = previewRowsToRecords(preview.rows, {
      includeConflicts: false,
      sourceFileId: 'src-apple',
      importedAt: '2026-03-01T12:00:00.000Z',
    });
    expect(records.length).toBe(preview.willImport);
    expect(records.every((r) => r.confirmed && r.sourceFileId === 'src-apple')).toBe(true);
  });
});

describe('Apple Health ZIP', () => {
  it('extracts export.xml and ignores route/ECG siblings', async () => {
    const xml = readFixture('synthetic-export.xml');
    const zip = buildStoreZip([
      { name: 'apple_health_export/export.xml', content: new TextEncoder().encode(xml) },
      { name: 'apple_health_export/workout-routes/route.gpx', content: new TextEncoder().encode('<gpx/>') },
      { name: 'apple_health_export/electrocardiograms/ecg.csv', content: new TextEncoder().encode('a,b') },
    ]);
    const extracted = await extractAppleHealthXmlFromZip(zip);
    expect(extracted.fileName.toLowerCase().endsWith('export.xml')).toBe(true);
    expect(extracted.xmlText).toContain('HealthData');

    const file = fileFromBytes(zip, 'export.zip', 'application/zip');
    const parsed = await loadAppleHealthExportFile(file);
    expect(parsed.candidates.some((c) => c.kind === 'workout')).toBe(true);
  });

  it('rejects ZIP with too many entries (bomb guard)', async () => {
    const many = Array.from({ length: MAX_APPLE_HEALTH_ZIP_ENTRIES + 1 }, (_, i) => ({
      name: `f${i}.txt`,
      content: new TextEncoder().encode('x'),
    }));
    const zip = buildStoreZip(many);
    await expect(extractAppleHealthXmlFromZip(zip)).rejects.toThrow(/条目超过|解压炸弹/);
  });

  it('rejects ZIP without export.xml', async () => {
    const zip = buildStoreZip([
      { name: 'only-route.gpx', content: new TextEncoder().encode('<gpx/>') },
    ]);
    await expect(extractAppleHealthXmlFromZip(zip)).rejects.toThrow(/export\.xml/);
  });
});

describe('Apple Health local-only parse (no network upload)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not call fetch while parsing XML or ZIP health payloads', async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('fetch must not be called');
    });
    vi.stubGlobal('fetch', fetchSpy);

    const xml = readFixture('synthetic-export.xml');
    parseAppleHealthXmlText(xml, 'synthetic-export.xml');

    const zip = buildStoreZip([
      { name: 'export.xml', content: new TextEncoder().encode(xml) },
    ]);
    await loadAppleHealthExportFile(fileFromBytes(zip, 'demo.zip', 'application/zip'));
    await loadAppleHealthExportFile(new File([xml], 'export.xml', { type: 'text/xml' }));

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
