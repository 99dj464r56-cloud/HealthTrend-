import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyHealthRecord } from '../domain/types';
import { loadHealthRecord, saveHealthRecord } from './indexedDb';
import { previewBackup, exportBackup } from '../import/backup';
import { buildReportModel } from '../report/reportModel';

describe('local-first operations without network', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('saves, loads, backups, and builds a report model without calling fetch', async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('fetch must not be called for local IndexedDB/backup/report paths');
    });
    vi.stubGlobal('fetch', fetchSpy);

    const record = {
      ...emptyHealthRecord(),
      profile: { displayName: 'Offline Demo', identityConfirmed: true },
      indicators: [{
        id: 'x', nameZh: '示例', nameEn: 'Sample', purposeZh: 'p', purposeEn: 'p',
        category: '组', unit: 'U/L', lowerLimit: null, upperLimit: null, priority: true,
      }],
      observations: [{
        id: 'o1', indicatorId: 'x', date: '2026-01-01', rawValue: '1', value: 1, comparator: 'none' as const,
        unit: 'U/L', lowerLimit: null, upperLimit: null, rangeProvenance: 'unknown' as const,
        laboratory: null, method: null, specimen: null, sourceId: null, pageNumber: null, confirmed: true as const,
      }],
    };
    await saveHealthRecord(record);
    await expect(loadHealthRecord()).resolves.toEqual(record);
    const blob = exportBackup(record);
    const file = new File([await blob.text()], 'local.json', { type: 'application/json' });
    const previewed = await previewBackup(file);
    expect(previewed.preview.counts.observations).toBe(1);
    const model = buildReportModel(previewed.record);
    expect(model.provenance.schemaVersion).toBe(4);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
