import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VaultLockedError,
  clearHealthRecord,
  getVaultMeta,
  initializeVault,
  loadHealthRecord,
  loadPlaintextRecordForMigration,
  readRawEntryForTests,
  saveHealthRecord,
  setActiveWorkspace,
  setSessionKey,
} from './indexedDb';
import { emptyHealthRecord } from '../domain/types';
import { createVault, unlockVault } from '../security/vault';

const PASSWORD = 'test-only-temporary-db';
const plaintext = { ...emptyHealthRecord(), profile: { displayName: 'Migration Probe', identityConfirmed: true } };

describe('personal IndexedDB encryption at rest', () => {
  beforeEach(() => {
    // Temporary in-memory DB per test — never the real personal profile.
    vi.stubGlobal('indexedDB', new IDBFactory());
    setActiveWorkspace('personal');
    setSessionKey(null);
  });
  afterEach(() => {
    setSessionKey(null);
    vi.unstubAllGlobals();
  });

  it('migrates an existing plaintext record to ciphertext on first password setup', async () => {
    await saveHealthRecord(plaintext);
    expect(await readRawEntryForTests('current')).toBeTruthy();
    const migrating = await loadPlaintextRecordForMigration();
    expect(migrating?.profile.displayName).toBe('Migration Probe');

    const { meta, key } = await createVault(PASSWORD, 100_000);
    await initializeVault(meta, key, migrating!);

    expect(await readRawEntryForTests('current')).toBeUndefined();
    const enc = await readRawEntryForTests('current-enc');
    expect(JSON.stringify(enc)).not.toContain('Migration Probe');
    expect(await getVaultMeta()).toEqual(meta);
    expect(await loadPlaintextRecordForMigration()).toBeNull();
  });

  it('refuses to read or write plaintext while locked', async () => {
    const { meta, key } = await createVault(PASSWORD, 100_000);
    await initializeVault(meta, key, plaintext);
    setSessionKey(null);
    await expect(loadHealthRecord()).rejects.toBeInstanceOf(VaultLockedError);
    await expect(saveHealthRecord(plaintext)).rejects.toBeInstanceOf(VaultLockedError);
    expect(await readRawEntryForTests('current')).toBeUndefined();

    const unlocked = await unlockVault(meta, PASSWORD);
    setSessionKey(unlocked.key);
    expect((await loadHealthRecord())?.profile.displayName).toBe('Migration Probe');
  });

  it('saves edits as ciphertext and clear keeps the vault', async () => {
    const { meta, key } = await createVault(PASSWORD, 100_000);
    await initializeVault(meta, key, emptyHealthRecord());
    await saveHealthRecord({ ...plaintext, profile: { displayName: 'Edited Name', identityConfirmed: true } });
    expect(JSON.stringify(await readRawEntryForTests('current-enc'))).not.toContain('Edited Name');
    expect((await loadHealthRecord())?.profile.displayName).toBe('Edited Name');
    await clearHealthRecord();
    expect(await getVaultMeta()).not.toBeNull();
    expect(await loadHealthRecord()).toBeNull();
  });
});
