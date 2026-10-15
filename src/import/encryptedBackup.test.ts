import { describe, expect, it } from 'vitest';
import { buildBackupFile, createVault } from '../security/vault';
import { emptyHealthRecord } from '../domain/types';
import { exportEncryptedBackup, restoreEncryptedBackup } from './encryptedBackup';

const record = { ...emptyHealthRecord(), profile: { displayName: 'Synthetic Backup Person', identityConfirmed: true } };
const password = 'backup-test-secret';
const asFile = (value: unknown) => new File([JSON.stringify(value)], 'health-trend-personal.enc.json');

describe('portable encrypted backups', () => {
  it('exports ciphertext and restores reviewed data with the password only', async () => {
    const backup = await exportEncryptedBackup(record, password);
    const json = JSON.stringify(backup);
    expect(json).not.toContain(record.profile.displayName);
    expect(json).not.toContain(password);
    expect(json).not.toContain('touchId');
    await expect(restoreEncryptedBackup(asFile(backup), password)).resolves.toEqual(record);
  });
  it('never exports a file larger than the restore limit', async () => {
    const oversized = { ...record, profile: { ...record.profile, displayName: '测'.repeat(7 * 1024 * 1024) } };
    const result = await exportEncryptedBackup(oversized, password).then(() => 'unexpected-success', e => String(e));
    expect(result).toContain('25 MiB');
  });
  it('rejects excessive imported key-derivation work before decrypting', async () => {
    const backup = await exportEncryptedBackup(record, password);
    backup.kdf.iterations = 2_000_001;
    await expect(restoreEncryptedBackup(asFile(backup), password)).rejects.toThrow(/参数无效/);
  });
  it('rejects authenticated ciphertext containing an invalid health record', async () => {
    const vault = await createVault(password);
    try {
      const backup = await buildBackupFile(vault.meta, vault.key, { schemaVersion: 4, profile: null });
      await expect(restoreEncryptedBackup(asFile(backup), password)).rejects.toThrow();
    } finally { vault.rawKey.fill(0); }
  });
  it('rejects weak passwords', async () => {
    await expect(exportEncryptedBackup(record, 'short')).rejects.toThrow(/至少/);
  });
  it('rejects wrong passwords and tampering', async () => {
    const backup = await exportEncryptedBackup(record, password);
    await expect(restoreEncryptedBackup(asFile(backup), 'wrong-password')).rejects.toThrow();
    backup.cipher.ciphertext = 'AAAA';
    await expect(restoreEncryptedBackup(asFile(backup), password)).rejects.toThrow();
  });
  it('rejects plaintext, malformed and oversized files before restoration', async () => {
    await expect(restoreEncryptedBackup(asFile(record), password)).rejects.toThrow(/加密备份/);
    await expect(restoreEncryptedBackup(new File(['{'], 'broken.json'), password)).rejects.toThrow(/JSON/);
    await expect(restoreEncryptedBackup(new File([new Uint8Array(25 * 1024 * 1024 + 1)], 'huge.json'), password)).rejects.toThrow(/25/);
  });
});
