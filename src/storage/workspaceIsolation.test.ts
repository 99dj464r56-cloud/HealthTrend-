import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearHealthRecord,
  getActiveDatabaseName,
  loadHealthRecord,
  saveHealthRecord,
  setActiveWorkspace,
} from './indexedDb';
import { emptyHealthRecord } from '../domain/types';
import { WORKSPACE_DB } from '../workspace/mode';

describe('guest / personal / demo IndexedDB isolation', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps guest, personal, and demo records in separate databases', async () => {
    setActiveWorkspace('personal');
    expect(getActiveDatabaseName()).toBe(WORKSPACE_DB.personal);
    await saveHealthRecord({
      ...emptyHealthRecord(),
      profile: { displayName: 'LocalUser', identityConfirmed: true },
    });

    setActiveWorkspace('guest');
    expect(getActiveDatabaseName()).toBe(WORKSPACE_DB.guest);
    await expect(loadHealthRecord()).resolves.toBeNull();
    await saveHealthRecord({
      ...emptyHealthRecord(),
      profile: { displayName: 'Guest', identityConfirmed: true },
    });

    setActiveWorkspace('demo');
    expect(getActiveDatabaseName()).toBe(WORKSPACE_DB.demo);
    await expect(loadHealthRecord()).resolves.toBeNull();
    await saveHealthRecord({
      ...emptyHealthRecord(),
      profile: { displayName: '示范用户 / Demo User', identityConfirmed: true },
    });

    setActiveWorkspace('personal');
    await expect(loadHealthRecord()).resolves.toMatchObject({ profile: { displayName: 'LocalUser' } });
    setActiveWorkspace('guest');
    await expect(loadHealthRecord()).resolves.toMatchObject({ profile: { displayName: 'Guest' } });
    setActiveWorkspace('demo');
    await expect(loadHealthRecord()).resolves.toMatchObject({ profile: { displayName: '示范用户 / Demo User' } });

    await clearHealthRecord();
    await expect(loadHealthRecord()).resolves.toBeNull();
    setActiveWorkspace('personal');
    await expect(loadHealthRecord()).resolves.toMatchObject({ profile: { displayName: 'LocalUser' } });
    setActiveWorkspace('guest');
    await expect(loadHealthRecord()).resolves.toMatchObject({ profile: { displayName: 'Guest' } });
  });
});
