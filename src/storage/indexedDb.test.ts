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
