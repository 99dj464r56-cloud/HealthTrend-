import { describe, expect, it } from 'vitest';
import {
  WeakPasswordError,
  WrongPasswordError,
  buildBackupFile,
  createVault,
  decryptJson,
  encryptJson,
  isEncryptedBackupFile,
  isVaultMeta,
  openBackupFile,
  unlockVault,
} from './vault';

const ITER = 100_000; // faster than production 310k; same code path
const PASSWORD = 'test-only-correct-horse';
const record = { profile: { displayName: 'Synthetic Tester' }, observations: [{ value: 5.6 }] };

describe('password vault (PBKDF2 -> AES-GCM envelope)', () => {
  it('round-trips data with the password and stores no password material', async () => {
    const created = await createVault(PASSWORD, ITER);
    expect(isVaultMeta(created.meta)).toBe(true);
    const metaText = JSON.stringify(created.meta);
    expect(metaText).not.toContain(PASSWORD);
    expect(created.key.extractable).toBe(false);
    const blob = await encryptJson(created.key, record);
    expect(blob.ciphertext).not.toContain('Synthetic');
    const unlocked = await unlockVault(created.meta, PASSWORD);
    await expect(decryptJson(unlocked.key, blob)).resolves.toEqual(record);
  });

  it('uses >= 310k PBKDF2 iterations and a random salt by default', async () => {
    const a = await createVault(PASSWORD);
    const b = await createVault(PASSWORD);
    expect(a.meta.kdf.iterations).toBeGreaterThanOrEqual(310_000);
    expect(a.meta.kdf.salt).not.toBe(b.meta.kdf.salt);
  }, 30_000);

  it('rejects a wrong password', async () => {
    const { meta } = await createVault(PASSWORD, ITER);
    await expect(unlockVault(meta, 'wrong-password-123')).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('rejects short passwords', async () => {
    await expect(createVault('short', ITER)).rejects.toBeInstanceOf(WeakPasswordError);
  });

  it('backup file restores with the password alone (new browser, no local vault)', async () => {
    const { meta, key } = await createVault(PASSWORD, ITER);
    const file = await buildBackupFile(meta, key, record);
    expect(isEncryptedBackupFile(file)).toBe(true);
    const json = JSON.stringify(file);
    expect(json).not.toContain('Synthetic');
    expect(json).not.toContain(PASSWORD);
    const parsed = JSON.parse(json);
    const opened = await openBackupFile(parsed, PASSWORD);
    expect(opened.record).toEqual(record);
    await expect(openBackupFile(parsed, 'wrong-password-123')).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('detects tampered ciphertext', async () => {
    const { meta, key } = await createVault(PASSWORD, ITER);
    const file = await buildBackupFile(meta, key, record);
    const bytes = atob(file.cipher.ciphertext).split('');
    bytes[5] = String.fromCharCode(bytes[5]!.charCodeAt(0) ^ 1);
    const tampered = { ...file, cipher: { ...file.cipher, ciphertext: btoa(bytes.join('')) } };
    await expect(openBackupFile(tampered, PASSWORD)).rejects.toBeInstanceOf(WrongPasswordError);
  });
});
