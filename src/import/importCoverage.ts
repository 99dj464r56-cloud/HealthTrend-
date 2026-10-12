import type { Observation, ReportTextBlock } from '../domain/types';

export interface ImportCoverageStats {
  candidates: number;
  confirmed: number;
  unrecognized: number;
  skipped: Array<{ reason: string; count: number }>;
}

export type ImportConflictKind = 'duplicate' | 'conflict' | 'new';

export function summarizeImportCoverage(input: {
  candidates: number;
  confirmed: number;
  unrecognizedLines?: number;
  skipped?: Array<{ reason: string; count: number }>;
}): ImportCoverageStats {
  return {
    candidates: input.candidates,
    confirmed: input.confirmed,
    unrecognized: input.unrecognizedLines ?? Math.max(0, input.candidates - input.confirmed),
    skipped: input.skipped ?? [],
  };
}

export function formatImportCoverage(stats: ImportCoverageStats): string {
  const skipped = stats.skipped.map((item) => `${item.reason}:${item.count}`).join(', ') || '无';
  return `识别候选 ${stats.candidates} · 已确认 ${stats.confirmed} · 未识别 ${stats.unrecognized} · 跳过（${skipped}）。识别完成不等于整份报告已完整导入。`;
}

export function observationFingerprint(observation: Pick<Observation, 'indicatorId' | 'date' | 'rawValue' | 'unit' | 'laboratory' | 'method'>): string {
  return [
    observation.indicatorId,
    observation.date,
    observation.rawValue.trim().toLowerCase(),
    observation.unit.trim().toLowerCase(),
    (observation.laboratory ?? '').trim().toLowerCase(),
    (observation.method ?? '').trim().toLowerCase(),
  ].join('|');
}

export function classifyObservationImport(
  candidate: Pick<Observation, 'indicatorId' | 'date' | 'rawValue' | 'unit' | 'laboratory' | 'method' | 'value'>,
  existing: Observation[],
): ImportConflictKind {
  const exact = existing.find((item) => observationFingerprint(item) === observationFingerprint(candidate));
  if (exact) return 'duplicate';
  const similar = existing.find((item) =>
    item.indicatorId === candidate.indicatorId
    && item.date === candidate.date
    && item.unit === candidate.unit
    && observationFingerprint(item) !== observationFingerprint(candidate));
  return similar ? 'conflict' : 'new';
}

export function reportTextFingerprint(input: {
  reportName: string;
  reportDate: string | null;
  laboratory: string | null;
  pageNumber: number | null;
  sectionTitle: string;
  body: string;
}): string {
  return [
    input.reportName.trim().toLowerCase(),
    input.reportDate ?? '',
    (input.laboratory ?? '').trim().toLowerCase(),
    input.pageNumber ?? '',
    input.sectionTitle.trim().toLowerCase(),
    input.body.trim(),
  ].join('|');
}

export function findDuplicateReportText(
  candidate: ReturnType<typeof reportTextFingerprint> extends string ? {
    reportName: string;
    reportDate: string | null;
    laboratory: string | null;
    pageNumber: number | null;
    sectionTitle: string;
    body: string;
  } : never,
  existing: ReportTextBlock[],
): ReportTextBlock | undefined {
  const fingerprint = reportTextFingerprint(candidate);
  return existing.find((block) => block.contentFingerprint === fingerprint);
}
