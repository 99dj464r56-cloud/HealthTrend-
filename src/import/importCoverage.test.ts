import { describe, expect, it } from 'vitest';
import {
  classifyObservationImport,
  findDuplicateReportText,
  formatImportCoverage,
  reportTextFingerprint,
  summarizeImportCoverage,
} from './importCoverage';
import type { Observation } from '../domain/types';

const base: Observation = {
  id: 'o1', indicatorId: 'glucose', date: '2026-01-01', rawValue: '5.1', value: 5.1, comparator: 'none',
  unit: 'mmol/L', lowerLimit: 3.9, upperLimit: 6.1, rangeProvenance: 'from-report',
  laboratory: 'Lab A', method: 'EIA', specimen: null, sourceId: null, pageNumber: null, confirmed: true,
};

describe('import coverage and duplicate detection', () => {
  it('summarizes coverage without claiming the whole report was imported', () => {
    const stats = summarizeImportCoverage({ candidates: 10, confirmed: 4, unrecognizedLines: 3, skipped: [{ reason: 'no unit', count: 3 }] });
    expect(formatImportCoverage(stats)).toContain('识别候选 10');
    expect(formatImportCoverage(stats)).toContain('不等于整份报告');
  });

  it('detects exact duplicates and similar conflicts', () => {
    expect(classifyObservationImport(base, [base])).toBe('duplicate');
    expect(classifyObservationImport({ ...base, rawValue: '5.5', value: 5.5 }, [base])).toBe('conflict');
    expect(classifyObservationImport({ ...base, date: '2026-02-01' }, [base])).toBe('new');
  });

  it('fingerprints report text so duplicate paragraphs are not spliced again', () => {
    const candidate = {
      reportName: 'Checkup', reportDate: '2026-01-01', laboratory: 'Lab', pageNumber: 2,
      sectionTitle: '结论', body: 'Hello',
    };
    const existing = [{
      id: 't1', sourceId: null, ...candidate, sectionKind: 'conclusion' as const, kind: 'verbatim' as const,
      contentFingerprint: reportTextFingerprint(candidate), confirmed: true as const,
    }];
    expect(findDuplicateReportText(candidate, existing)?.id).toBe('t1');
    expect(findDuplicateReportText({ ...candidate, body: 'Other' }, existing)).toBeUndefined();
  });
});
