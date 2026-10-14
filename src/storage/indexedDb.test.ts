import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as storage from './indexedDb';
import type { HealthRecord } from '../domain/types';
import { emptyHealthRecord } from '../domain/types';

const record: HealthRecord = {
  ...emptyHealthRecord(),
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

function method(name: string): (...args: unknown[]) => Promise<unknown> {
  const candidate = Reflect.get(storage, name);
  if (typeof candidate !== 'function') return async () => ({ missing: true });
  return candidate as (...args: unknown[]) => Promise<unknown>;
}

describe('local health record storage', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory());
  });

  afterEach(() => vi.unstubAllGlobals());

  it('round-trips the confirmed health record in IndexedDB', async () => {
    await method('saveHealthRecord')(record);
    await expect(method('loadHealthRecord')()).resolves.toEqual(record);
  });

  it('returns null for a new local database', async () => {
    await expect(method('loadHealthRecord')()).resolves.toBeNull();
  });

  it('clears the saved record on explicit request', async () => {
    await method('saveHealthRecord')(record);
    await method('clearHealthRecord')();
    await expect(method('loadHealthRecord')()).resolves.toBeNull();
  });
});

it('conditional encrypted restore refuses a changed vault and preserves newer data', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  storage.setActiveWorkspace('personal');
  const { createVault } = await import('../security/vault');
  const vault = await createVault('synthetic-password', 1000);
  const empty = emptyHealthRecord();
  await storage.initializeVault(vault.meta, vault.key, empty);
  const newer = { ...empty, profile: { displayName: 'Synthetic Newer', identityConfirmed: true } };
  await storage.saveHealthRecord(newer);
  await expect(storage.saveHealthRecordIfUnchanged(record, empty)).rejects.toThrow(/已改变/);
  expect(await storage.loadHealthRecord()).toEqual(newer);
  await storage.saveHealthRecordIfUnchanged(empty, newer);
  expect(await storage.loadHealthRecord()).toEqual(empty);
  storage.setSessionKey(null);
  vi.unstubAllGlobals();
});

it('conditional restore catches a write during encryption before its atomic transaction', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  storage.setActiveWorkspace('personal');
  const { createVault } = await import('../security/vault');
  const vault = await createVault('synthetic-password', 1000);
  const empty = emptyHealthRecord();
  await storage.initializeVault(vault.meta, vault.key, empty);
  const newer = { ...empty, profile: { displayName: 'Concurrent Synthetic', identityConfirmed: true } };
  const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'encrypt').mockImplementationOnce(async (...args) => {
    await storage.saveHealthRecord(newer);
    return encrypt(...args);
  });
  await expect(storage.saveHealthRecordIfUnchanged(record, empty)).rejects.toThrow(/已改变/);
  expect(await storage.loadHealthRecord()).toEqual(newer);
  storage.setSessionKey(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
