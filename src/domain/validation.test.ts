import { describe, expect, it } from 'vitest';
import * as validation from './validation';
import type { HealthRecord } from './types';
import { emptyHealthRecord } from './types';

const validRecord: HealthRecord = {
  ...emptyHealthRecord(),
  profile: { displayName: 'Alex Demo', identityConfirmed: true },
  medications: [{
    id: 'med-1', nameZh: '示例药物', nameEn: 'Example medicine', linkedIndicatorIds: ['glucose'], monitoringNote: null,
  }],
  regimenStages: [{
    id: 'stage-1', medicationId: 'med-1', strengthLabel: '10 mg', doseAmount: '1', doseUnit: 'tablet',
    frequency: 'Daily', form: 'tablet', packCountLabel: '30 tablets',
    startDate: '2024-01-01', endDate: null,
  }],
  indicators: [{
    id: 'glucose', nameZh: '空腹血糖', nameEn: 'Fasting glucose', purposeZh: '观察血糖', purposeEn: 'Tracks glucose',
    category: '代谢', unit: 'mmol/L', lowerLimit: 3.9, upperLimit: 6.1, priority: true,
  }],
  observations: [{
    id: 'obs-1', indicatorId: 'glucose', date: '2024-04-02', rawValue: '5.1', value: 5.1, comparator: 'none',
    unit: 'mmol/L', lowerLimit: 3.9, upperLimit: 6.1, rangeProvenance: 'from-report',
    laboratory: 'Demo Lab A', method: null, specimen: null, sourceId: 'src-1', pageNumber: 1, confirmed: true,
  }],
  reportTextBlocks: [{
    id: 'text-1', sourceId: 'src-1', reportName: 'Demo report', reportDate: '2024-04-02', laboratory: 'Demo Lab A',
    pageNumber: 2, sectionTitle: '结论', sectionKind: 'conclusion',
    body: 'Synthetic conclusion.', kind: 'verbatim',
    contentFingerprint: 'demo|2024-04-02|demo lab a|2|结论|Synthetic conclusion.', confirmed: true,
  }],
  sources: [{ id: 'src-1', fileName: 'fictional-report.pdf', type: 'pdf', importedAt: '2024-04-02T12:00:00Z', pageCount: 1 }],
};

function validate(record: unknown): { kind: 'ok'; value: unknown } | { kind: 'error'; message: string } | { kind: 'missing' } {
  const candidate = Reflect.get(validation, 'validateHealthRecord');
  if (typeof candidate !== 'function') return { kind: 'missing' };
  try {
    return { kind: 'ok', value: candidate(record) };
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

describe('validateHealthRecord', () => {
  it('accepts a complete reviewed v4 record without changing its values', () => {
    expect(validate(validRecord)).toEqual({ kind: 'ok', value: validRecord });
  });

  it('rejects inverted regimen date ranges', () => {
    const malformed = structuredClone(validRecord);
    malformed.regimenStages[0]!.startDate = '2025-01-01';
    malformed.regimenStages[0]!.endDate = '2024-01-01';
    expect(validate(malformed).kind).toBe('error');
  });

  it('rejects unconfirmed report text', () => {
    const malformed = structuredClone(validRecord);
    Object.assign(malformed.reportTextBlocks[0]!, { confirmed: false });
    expect(validate(malformed).kind).toBe('error');
  });

  it('rejects a non-calendar observation date', () => {
    const malformed = structuredClone(validRecord);
    malformed.observations[0]!.date = '2026-02-30';
    expect(validate(malformed).kind).toBe('error');
  });

  it('rejects schema version 3 without migration', () => {
    expect(validate({ ...validRecord, schemaVersion: 3 }).kind).toBe('error');
  });
});

describe('record updatedAt (migration-safe)', () => {
  it('accepts records with or without a valid updatedAt and rejects invalid values', () => {
    expect(validation.validateHealthRecord({ ...emptyHealthRecord() }).updatedAt).toBeUndefined();
    expect(validation.validateHealthRecord({ ...emptyHealthRecord(), updatedAt: '2026-01-02T03:04:05.000Z' }).updatedAt)
      .toBe('2026-01-02T03:04:05.000Z');
    expect(() => validation.validateHealthRecord({ ...emptyHealthRecord(), updatedAt: 'not-a-date' })).toThrow(/updatedAt/);
  });
});
