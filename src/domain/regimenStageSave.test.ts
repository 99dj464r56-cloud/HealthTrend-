import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrateHealthRecord } from './migrate';
import { HealthRecordValidationError, assertRegimenStageDates, validateHealthRecord } from './validation';

describe('regimen stage save acceptance', () => {
  it('accepts empty endDate as ongoing (仍使用) and empty startDate', () => {
    expect(() => assertRegimenStageDates('2024-03-01', null)).not.toThrow();
    expect(() => assertRegimenStageDates(null, null)).not.toThrow();
    expect(() => assertRegimenStageDates(null, '2024-03-01')).not.toThrow();
    expect(() => assertRegimenStageDates('2025-01-01', '2024-01-01')).toThrow(HealthRecordValidationError);
  });

  it('round-trips an edited demo stage with startDate set and endDate still null', () => {
    const raw = JSON.parse(readFileSync('public/seeds/demo-record.json', 'utf8'));
    const record = validateHealthRecord(migrateHealthRecord(raw));
    expect(record.regimenStages.length).toBeGreaterThan(0);
    const target = record.regimenStages[0]!;
    const next = validateHealthRecord({
      ...record,
      regimenStages: record.regimenStages.map((s) => (s.id === target.id
        ? { ...s, startDate: '2024-01-15', endDate: null, frequency: '每晚一片', strengthLabel: '80 mg' }
        : s)),
    });
    const saved = next.regimenStages.find((s) => s.id === target.id)!;
    expect(saved.startDate).toBe('2024-01-15');
    expect(saved.endDate).toBeNull();
  });
});
