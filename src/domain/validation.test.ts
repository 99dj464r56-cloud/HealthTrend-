import { describe, expect, it } from 'vitest';
import * as validation from './validation';
import type { HealthRecord } from './types';

const validRecord: HealthRecord = {
  schemaVersion: 1,
  medications: [{
    id: 'med-1', nameZh: '示例药物', nameEn: 'Example medicine', strength: '10 mg', instructions: 'Daily',
    startDate: '2024-01-01', endDate: null, linkedIndicatorIds: ['glucose'],
  }],
  indicators: [{
    id: 'glucose', nameZh: '空腹血糖', nameEn: 'Fasting glucose', purposeZh: '观察血糖', purposeEn: 'Tracks glucose',
    category: '代谢', unit: 'mmol/L', lowerLimit: 3.9, upperLimit: 6.1, priority: true,
  }],
  observations: [{ id: 'obs-1', indicatorId: 'glucose', date: '2024-04-02', value: 5.1, unit: 'mmol/L', sourceId: 'src-1', confirmed: true }],
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
  it('accepts a complete reviewed record without changing its values', () => {
    expect(validate(validRecord)).toEqual({ kind: 'ok', value: validRecord });
  });

  it('rejects a non-calendar observation date', () => {
    const malformed = structuredClone(validRecord);
    malformed.observations[0]!.date = '2026-02-30';
    expect(validate(malformed).kind).toBe('error');
  });

  it('rejects non-finite laboratory values', () => {
    const malformed = structuredClone(validRecord);
    malformed.observations[0]!.value = Number.NaN;
    expect(validate(malformed).kind).toBe('error');
  });

  it('rejects observations whose units differ from the indicator unit', () => {
    const malformed = structuredClone(validRecord);
    malformed.observations[0]!.unit = 'mg/dL';
    expect(validate(malformed).kind).toBe('error');
  });

  it('rejects unconfirmed OCR observations from the saved record', () => {
    const malformed = structuredClone(validRecord);
    Object.assign(malformed.observations[0]!, { confirmed: false });
    expect(validate(malformed).kind).toBe('error');
  });

  it('rejects duplicate record IDs', () => {
    const malformed = structuredClone(validRecord);
    malformed.sources.push({ ...malformed.sources[0]!, id: 'obs-1' });
    expect(validate(malformed).kind).toBe('error');
  });

  it('rejects inverted reference bounds', () => {
    const malformed = structuredClone(validRecord);
    malformed.indicators[0]!.lowerLimit = 7;
    malformed.indicators[0]!.upperLimit = 2;
    expect(validate(malformed).kind).toBe('error');
  });
});
