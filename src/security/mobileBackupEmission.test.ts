// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setActiveWorkspace } from '../storage/indexedDb';
import { shareEncryptedBackupFile, mobileBackupStale, confirmMobileBackupSaved, bumpMobileBackupChanges, hasUnconfirmedBackup } from './mobileBackup';
import { buildBackupFile, createVault } from './vault';
import { emptyHealthRecord } from '../domain/types';
beforeEach(() => { vi.stubGlobal('indexedDB', new IDBFactory()); setActiveWorkspace('personal'); });
afterEach(() => { setActiveWorkspace('guest'); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('download initiation stays stale until explicitly confirmed and preserves later edits', async () => {
  const vault = await createVault('synthetic-password');
  const file = await buildBackupFile(vault.meta, vault.key, emptyHealthRecord());
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  await shareEncryptedBackupFile(file);
  expect((await mobileBackupStale()).stale).toBe(true);
  expect(await hasUnconfirmedBackup()).toBe(true);
  await bumpMobileBackupChanges();
  await confirmMobileBackupSaved();
  expect((await mobileBackupStale()).changes).toBe(1);
  expect(await hasUnconfirmedBackup()).toBe(false);
});
it('cannot confirm a file that was never emitted', async () => {
  await expect(confirmMobileBackupSaved()).rejects.toThrow(/先生成/);
});
