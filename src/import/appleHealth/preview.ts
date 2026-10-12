import type { AppleHealthRecord } from '../../domain/types';
import { localDateInRange } from './dates';
import type { AppleHealthCandidate, AppleHealthParseResult } from './parseExport';

export type AppleImportStatus = 'will-import' | 'duplicate' | 'conflict' | 'unsupported' | 'filtered';

export interface AppleHealthPreviewRow extends AppleHealthCandidate {
  status: AppleImportStatus;
}

export interface AppleHealthPreviewSummary {
  willImport: number;
  duplicate: number;
  conflict: number;
  unsupported: number;
  filtered: number;
  dateRange: { min: string | null; max: string | null };
  rows: AppleHealthPreviewRow[];
  skipped: Array<{ reason: string; count: number }>;
  unsupportedTypeCounts: Record<string, number>;
  sourceFileName: string;
}

export interface AppleHealthFilter {
  kinds: Set<'sample' | 'workout' | 'activitySummary'>;
  typeIdentifiers: Set<string> | null; // null = all supported present in parse
  dateFrom: string | null;
  dateTo: string | null;
}

function similarButDifferent(a: AppleHealthCandidate, b: AppleHealthRecord): boolean {
  return a.kind === b.kind
    && a.typeIdentifier === b.typeIdentifier
    && a.startAt === b.startAt
    && a.importFingerprint !== b.importFingerprint;
}

export function buildAppleHealthPreview(
  parsed: AppleHealthParseResult,
  existing: AppleHealthRecord[],
  filter: AppleHealthFilter,
): AppleHealthPreviewSummary {
  const byFingerprint = new Map(existing.map((row) => [row.importFingerprint, row]));
  const rows: AppleHealthPreviewRow[] = [];
  let willImport = 0;
  let duplicate = 0;
  let conflict = 0;
  let unsupported = 0;
  let filtered = 0;

  for (const candidate of parsed.candidates) {
    if (candidate.skipReason) {
      unsupported += 1;
      rows.push({ ...candidate, status: 'unsupported' });
      continue;
    }
    if (!filter.kinds.has(candidate.kind)) {
      filtered += 1;
      rows.push({ ...candidate, status: 'filtered' });
      continue;
    }
    if (filter.typeIdentifiers && !filter.typeIdentifiers.has(candidate.typeIdentifier)) {
      filtered += 1;
      rows.push({ ...candidate, status: 'filtered' });
      continue;
    }
    if (!localDateInRange(candidate.localDate, filter.dateFrom, filter.dateTo)) {
      filtered += 1;
      rows.push({ ...candidate, status: 'filtered' });
      continue;
    }
    if (byFingerprint.has(candidate.importFingerprint)) {
      duplicate += 1;
      rows.push({ ...candidate, status: 'duplicate' });
      continue;
    }
    if (existing.some((row) => similarButDifferent(candidate, row))) {
      conflict += 1;
      rows.push({ ...candidate, status: 'conflict' });
      continue;
    }
    willImport += 1;
    rows.push({ ...candidate, status: 'will-import' });
  }

  const unsupportedFromParse = Object.values(parsed.unsupportedTypeCounts).reduce((a, b) => a + b, 0);

  return {
    willImport,
    duplicate,
    conflict,
    unsupported: unsupported + unsupportedFromParse,
    filtered,
    dateRange: parsed.dateRange,
    rows,
    skipped: parsed.skipped,
    unsupportedTypeCounts: parsed.unsupportedTypeCounts,
    sourceFileName: parsed.sourceFileName,
  };
}

export function previewRowsToRecords(
  rows: AppleHealthPreviewRow[],
  options: { includeConflicts: boolean; sourceFileId: string; importedAt: string },
): AppleHealthRecord[] {
  return rows
    .filter((row) => row.status === 'will-import' || (options.includeConflicts && row.status === 'conflict'))
    .filter((row) => !row.skipReason)
    .map((row) => ({
      id: crypto.randomUUID(),
      kind: row.kind,
      typeIdentifier: row.typeIdentifier,
      value: row.value,
      unit: row.unit,
      startAt: row.startAt,
      endAt: row.endAt,
      localDate: row.localDate,
      sourceName: row.sourceName,
      sourceBundleOrDevice: row.sourceBundleOrDevice,
      workoutActivityType: row.workoutActivityType,
      duration: row.duration,
      durationUnit: row.durationUnit,
      importFingerprint: row.importFingerprint,
      sourceFileId: options.sourceFileId,
      importedAt: options.importedAt,
      confirmed: true as const,
    }));
}
