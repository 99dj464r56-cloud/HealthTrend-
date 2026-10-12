import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrateHealthRecord, needsSchemaRewrite, profileNameMismatch } from './migrate';
import { validateHealthRecord } from './validation';
import {
  clearHealthRecord,
  loadHealthRecord,
  putRawHealthRecordForTests,
  saveHealthRecord,
} from '../storage/indexedDb';
import type { HealthRecord } from './types';
import { emptyHealthRecord } from './types';

const v1Legacy = {
  schemaVersion: 1 as const,
  medications: [],
  indicators: [{
    id: 'glucose', nameZh: '空腹血糖', nameEn: 'Fasting glucose', purposeZh: '观察血糖', purposeEn: 'Tracks glucose',
    category: '代谢', unit: 'mmol/L', lowerLimit: 3.9, upperLimit: 6.1, priority: true,
  }],
  observations: [
    { id: 'obs-old', indicatorId: 'glucose', date: '2024-04-02', value: 5.1, unit: 'mmol/L', sourceId: null, confirmed: true as const },
    { id: 'obs-new-lab', indicatorId: 'glucose', date: '2026-01-15', value: 7.0, unit: 'mmol/L', sourceId: null, confirmed: true as const },
  ],
  sources: [],
};

describe('schema migration v1 → v2', () => {
  it('copies indicator ranges onto each observation as migrated-unverified and never claims from-report', () => {
    const migrated = migrateHealthRecord(v1Legacy);
    expect(migrated.schemaVersion).toBe(4);
    expect(migrated.profile).toEqual({ displayName: '', identityConfirmed: false });
    expect(migrated.observations).toHaveLength(2);
    for (const observation of migrated.observations) {
      expect(observation.lowerLimit).toBe(3.9);
      expect(observation.upperLimit).toBe(6.1);
      expect(observation.rangeProvenance).toBe('migrated-unverified');
      expect(observation.rawValue).toBe(String(observation.value));
      expect(observation.comparator).toBe('none');
      expect(observation.laboratory).toBeNull();
      expect(observation.method).toBeNull();
      expect(observation.specimen).toBeNull();
    }
    expect(validateHealthRecord(migrated).observations[0]?.rangeProvenance).toBe('migrated-unverified');
  });

  it('keeps absent indicator ranges as unknown without inventing bounds', () => {
    const raw = {
      ...structuredClone(v1Legacy),
      indicators: [{
        ...structuredClone(v1Legacy).indicators[0]!,
        lowerLimit: null as number | null,
        upperLimit: null as number | null,
      }],
    };
    const migrated = migrateHealthRecord(raw);
    expect(migrated.observations[0]).toMatchObject({
      lowerLimit: null, upperLimit: null, rangeProvenance: 'unknown',
    });
  });

  it('does not rewrite already-owned observation ranges when migrating a v2-shaped payload', () => {
    const v2 = {
      schemaVersion: 2 as const,
      profile: { displayName: '', identityConfirmed: false },
      medications: [],
      indicators: v1Legacy.indicators,
      observations: [{
        id: 'obs-1', indicatorId: 'glucose', date: '2024-04-02', rawValue: '5.1', value: 5.1, comparator: 'none' as const,
        unit: 'mmol/L', lowerLimit: 4, upperLimit: 5.5, rangeProvenance: 'from-report' as const,
        laboratory: 'Demo Lab', method: null, specimen: null, sourceId: null, pageNumber: null, confirmed: true as const,
      }],
      sources: [],
    };
    const migrated = migrateHealthRecord(v2);
    expect(migrated.observations[0]).toMatchObject({
      lowerLimit: 4, upperLimit: 5.5, rangeProvenance: 'from-report', laboratory: 'Demo Lab',
    });
  });

  it('migrates legacy medication dose fields into a regimen stage without dropping history identity', () => {
    const legacy = {
      ...structuredClone(v1Legacy),
      medications: [{
        id: 'med-1', nameZh: '示例药', nameEn: 'Example medicine', strength: '10 mg', instructions: 'Daily',
        startDate: '2024-01-01', endDate: null, linkedIndicatorIds: ['glucose'],
      }],
    };
    const migrated = migrateHealthRecord(legacy);
    expect(migrated.medications[0]).toMatchObject({ id: 'med-1', nameZh: '示例药', linkedIndicatorIds: ['glucose'] });
    expect(migrated.regimenStages).toHaveLength(1);
    expect(migrated.regimenStages[0]).toMatchObject({
      medicationId: 'med-1', strengthLabel: '10 mg', frequency: 'Daily', startDate: '2024-01-01', packCountLabel: null,
    });
    expect(migrated.reportTextBlocks).toEqual([]);
  });


  it('migrates v3 record to v4 with empty appleHealthRecords when absent', () => {
    const v3 = {
      schemaVersion: 3 as const,
      profile: { displayName: 'Alex Demo', identityConfirmed: true },
      medications: [],
      regimenStages: [],
      indicators: [],
      observations: [],
      reportTextBlocks: [],
      sources: [],
    };
    const migrated = migrateHealthRecord(v3);
    expect(migrated.schemaVersion).toBe(4);
    expect(migrated.appleHealthRecords).toEqual([]);
    expect(validateHealthRecord(migrated).appleHealthRecords).toEqual([]);
  });

  it('flags needsSchemaRewrite for legacy schema versions', () => {
    expect(needsSchemaRewrite(v1Legacy)).toBe(true);
    expect(needsSchemaRewrite({ ...emptyHealthRecord() })).toBe(false);
    expect(needsSchemaRewrite({ schemaVersion: 3, medications: [], indicators: [], observations: [], sources: [] })).toBe(true);
  });

  it('treats OCR name hints as mismatch prompts and never auto-matches blank profiles', () => {
    expect(profileNameMismatch('Parent A', { displayName: 'Alex Demo', identityConfirmed: true })).toBe(true);
    expect(profileNameMismatch('Alex Demo', { displayName: 'Alex Demo', identityConfirmed: true })).toBe(false);
    expect(profileNameMismatch('Parent A', { displayName: '', identityConfirmed: false })).toBe(false);
  });
});

describe('IndexedDB migrate load with rollback safety', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('loads a legacy v1 record, migrates to v2, and persists the upgrade', async () => {
    await putRawHealthRecordForTests(v1Legacy);
    const loaded = await loadHealthRecord();
    expect(loaded?.schemaVersion).toBe(4);
    expect(loaded?.observations[0]?.rangeProvenance).toBe('migrated-unverified');
    // Second load should already be v2 on disk
    const again = await loadHealthRecord();
    expect(again?.schemaVersion).toBe(4);
    expect(again?.observations[1]?.upperLimit).toBe(6.1);
  });

  it('leaves the original raw record untouched when migration/validation fails', async () => {
    const broken = {
      schemaVersion: 1,
      medications: [],
      indicators: [],
      observations: [{ id: 'bad', indicatorId: 'missing', date: '2024-01-01', value: 1, unit: 'U/L', sourceId: null, confirmed: true }],
      sources: [],
    };
    await putRawHealthRecordForTests(broken);
    await expect(loadHealthRecord()).rejects.toThrow(/unchanged/i);
    // Raw payload still present — clear would be the only destructive path
    await expect(loadHealthRecord()).rejects.toThrow(/unchanged/i);
    await clearHealthRecord();
    await expect(loadHealthRecord()).resolves.toBeNull();
  });

  it('round-trips a native v2 record including profile', async () => {
    const record: HealthRecord = {
      ...emptyHealthRecord(),
      profile: { displayName: 'Alex Demo', identityConfirmed: true },
      indicators: [{
        id: 'x', nameZh: '样本指标', nameEn: 'Sample indicator', purposeZh: '样本用途', purposeEn: 'Sample purpose',
        category: '样本', unit: 'U/L', lowerLimit: null, upperLimit: null, priority: false,
      }],
      observations: [{
        id: 'obs-a', indicatorId: 'x', date: '2025-01-01', rawValue: '2', value: 2, comparator: 'none',
        unit: 'U/L', lowerLimit: null, upperLimit: null, rangeProvenance: 'unknown',
        laboratory: null, method: null, specimen: null, sourceId: null, pageNumber: null, confirmed: true,
      }],
    };
    await saveHealthRecord(record);
    await expect(loadHealthRecord()).resolves.toEqual(record);
  });
});
