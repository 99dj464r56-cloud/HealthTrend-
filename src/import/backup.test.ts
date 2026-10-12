import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyBackupImportStrategy,
  BACKUP_ENCRYPTION_SUPPORTED,
  exportBackup,
  formatBackupPreviewSummary,
  parseBackup,
  previewBackup,
} from './backup';
import type { HealthRecord } from '../domain/types';
import { emptyHealthRecord } from '../domain/types';
import { loadHealthRecord, saveHealthRecord } from '../storage/indexedDb';

const record: HealthRecord = {
  ...emptyHealthRecord(),
  profile: { displayName: 'Alex Demo', identityConfirmed: true },
  medications: [{ id: 'med-bp', nameZh: '示例药', nameEn: 'Example med', linkedIndicatorIds: ['bp'] }],
  regimenStages: [{
    id: 'stage-bp', medicationId: 'med-bp', strengthLabel: '5 mg', doseAmount: '1', doseUnit: 'tablet',
    frequency: 'Daily', form: null, packCountLabel: null, startDate: null, endDate: null,
  }],
  indicators: [{ id: 'bp', nameZh: '收缩压', nameEn: 'Systolic blood pressure', purposeZh: '观察血压', purposeEn: 'Tracks blood pressure', category: '血压', unit: 'mmHg', lowerLimit: null, upperLimit: 120, priority: true }],
  observations: [{
    id: 'reading-1', indicatorId: 'bp', date: '2025-07-01', rawValue: '116', value: 116, comparator: 'none',
    unit: 'mmHg', lowerLimit: null, upperLimit: 120, rangeProvenance: 'from-report',
    laboratory: null, method: null, specimen: null, sourceId: null, pageNumber: null, confirmed: true,
  }],
};

describe('local JSON backup', () => {
  it('exports a portable JSON backup and round-trips reviewed values', async () => {
    const blob = exportBackup(record);
    expect(blob.type).toContain('application/json');
    await expect(parseBackup(new File([await blob.text()], 'backup.json', { type: 'application/json' }))).resolves.toEqual(record);
  });

  it('previews counts and migrate notes before any write', async () => {
    const legacy = {
      schemaVersion: 1,
      medications: [],
      indicators: record.indicators,
      observations: [{ id: 'reading-1', indicatorId: 'bp', date: '2025-07-01', value: 116, unit: 'mmHg', sourceId: null, confirmed: true }],
      sources: [],
    };
    const { preview, record: imported } = await previewBackup(new File([JSON.stringify(legacy)], 'legacy.json'));
    expect(preview.migrateRequired).toBe(true);
    expect(preview.migratedSchemaVersion).toBe(4);
    expect(preview.counts.observations).toBe(1);
    expect(preview.encryptionSupported).toBe(false);
    expect(BACKUP_ENCRYPTION_SUPPORTED).toBe(false);
    expect(formatBackupPreviewSummary(preview)).toContain('需迁移');
    expect(imported.observations[0]?.rangeProvenance).toBe('migrated-unverified');
  });

  it('migrates legacy v1 backups without claiming ranges are from-report', async () => {
    const legacy = {
      schemaVersion: 1,
      medications: [],
      indicators: record.indicators,
      observations: [{ id: 'reading-1', indicatorId: 'bp', date: '2025-07-01', value: 116, unit: 'mmHg', sourceId: null, confirmed: true }],
      sources: [],
    };
    const imported = await parseBackup(new File([JSON.stringify(legacy)], 'legacy.json'));
    expect(imported.schemaVersion).toBe(4);
    expect(imported.observations[0]).toMatchObject({
      value: 116, lowerLimit: null, upperLimit: 120, rangeProvenance: 'migrated-unverified',
    });
    expect(imported.regimenStages).toEqual([]);
  });

  it('rejects malformed JSON and unsupported schema versions', async () => {
    await expect(parseBackup(new File(['not json'], 'broken.json'))).rejects.toThrow();
    const future = new File([JSON.stringify({ ...record, schemaVersion: 99 })], 'future.json');
    await expect(parseBackup(future)).rejects.toThrow(/version/i);
  });

  it('applyBackupImportStrategy replace-all vs cancel without mutating inputs oddly', () => {
    const incoming = { ...emptyHealthRecord(), profile: { displayName: 'Incoming', identityConfirmed: true } };
    expect(applyBackupImportStrategy(record, incoming, 'cancel')).toBe(record);
    expect(applyBackupImportStrategy(record, incoming, 'replace-all')).toBe(incoming);
  });
});

describe('backup restore safety against IndexedDB', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('leaves the existing local record intact when backup parse fails', async () => {
    await saveHealthRecord(record);
    await expect(parseBackup(new File(['{bad'], 'bad.json'))).rejects.toThrow();
    await expect(previewBackup(new File([JSON.stringify({ schemaVersion: 99 })], 'future.json'))).rejects.toThrow();
    await expect(loadHealthRecord()).resolves.toEqual(record);
  });
});
