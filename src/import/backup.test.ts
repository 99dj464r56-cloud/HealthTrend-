import { describe, expect, it } from 'vitest';
import * as backup from './backup';
import type { HealthRecord } from '../domain/types';

const record: HealthRecord = {
  schemaVersion: 1, medications: [],
  indicators: [{ id: 'bp', nameZh: '收缩压', nameEn: 'Systolic blood pressure', purposeZh: '观察血压', purposeEn: 'Tracks blood pressure', category: '血压', unit: 'mmHg', lowerLimit: null, upperLimit: 120, priority: true }],
  observations: [{ id: 'reading-1', indicatorId: 'bp', date: '2025-07-01', value: 116, unit: 'mmHg', sourceId: null, confirmed: true }],
  sources: [],
};

function exportRecord(value: HealthRecord): Blob | null {
  const candidate = Reflect.get(backup, 'exportBackup');
  return typeof candidate === 'function' ? candidate(value) as Blob : null;
}

function importFile(file: File): Promise<HealthRecord | null> {
  const candidate = Reflect.get(backup, 'parseBackup');
  return typeof candidate === 'function' ? candidate(file) as Promise<HealthRecord> : Promise.reject(new Error('parseBackup is not implemented'));
}

describe('local JSON backup', () => {
  it('exports a portable JSON backup and round-trips reviewed values', async () => {
    const blob = exportRecord(record);
    expect(blob).toBeInstanceOf(Blob);
    if (!blob) return;
    expect(blob?.type).toContain('application/json');
    await expect(importFile(new File([await blob!.text()], 'backup.json', { type: 'application/json' }))).resolves.toEqual(record);
  });

  it('rejects malformed JSON and unsupported schema versions', async () => {
    await expect(importFile(new File(['not json'], 'broken.json'))).rejects.toThrow();
    const future = new File([JSON.stringify({ ...record, schemaVersion: 99 })], 'future.json');
    await expect(importFile(future)).rejects.toThrow(/version/i);
  });
});
