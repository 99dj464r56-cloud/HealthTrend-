import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearHealthRecord, setActiveWorkspace } from '../storage/indexedDb';
import {
  bumpMobileBackupChanges,
  mobileBackupStale,
  getBackupRevision,
  recordMobileBackupSuccess,
} from './mobileBackup';

describe('mobileBackup staleness', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    setActiveWorkspace('personal');
  });
  afterEach(async () => {
    await clearHealthRecord();
    setActiveWorkspace('guest');
    vi.unstubAllGlobals();
  });

  it('is stale before any success and after enough changes', async () => {
    let s = await mobileBackupStale();
    expect(s.stale).toBe(true);
    await recordMobileBackupSuccess();
    s = await mobileBackupStale();
    expect(s.stale).toBe(false);
    for (let i = 0; i < 5; i += 1) await bumpMobileBackupChanges();
    s = await mobileBackupStale();
    expect(s.stale).toBe(true);
    expect(s.reason).toMatch(/改动/);
  });
  it('confirming an older snapshot preserves newer edits', async () => {
    await bumpMobileBackupChanges();
    const revision = await getBackupRevision();
    await bumpMobileBackupChanges();
    await recordMobileBackupSuccess(revision);
    expect((await mobileBackupStale()).changes).toBe(1);
  });

});
