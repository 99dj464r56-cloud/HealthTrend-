/**
 * Local password vault for personal mode (envelope encryption).
 *
 *   password --PBKDF2-SHA256 (random 16-byte salt, 310k iterations)--> KEK_pw (AES-GCM-256)
 *   random 32-byte data key (DEK) --AES-GCM wrap with KEK_pw--> wrappedKey (stored)
 *   optional: Touch ID passkey PRF output --HKDF--> KEK_touch --wraps the same DEK (device-only)
 *   health record --AES-GCM with DEK--> ciphertext (IndexedDB + iCloud backup)
 *
 * Stored: salt, iteration count, wrapped DEK(s). Never the password or the raw DEK.
 * The DEK CryptoKey used for data is non-extractable and lives only in memory.
 * Backups carry the password-wrapped DEK so the password alone restores them on any Mac.
 */

export const PBKDF2_ITERATIONS = 310_000;
export const MIN_PASSWORD_LENGTH = 8;
const DATA_AAD = new TextEncoder().encode('health-trend-personal-v1');
const DEK_AAD = new TextEncoder().encode('health-trend-dek-v1');
export const BACKUP_FORMAT = 'health-trend-personal-enc';

export interface KdfParams {
  name: 'PBKDF2';
  hash: 'SHA-256';
  iterations: number;
  /** base64 */
  salt: string;
}

export interface CipherBlob {
  alg: 'AES-GCM';
  /** base64 */
  iv: string;
  /** base64 */
  ciphertext: string;
}

/** Touch ID (WebAuthn PRF) wrap of the DEK — bound to this browser profile + passkey. */
export interface WebAuthnTouchIdWrap {
  kind?: 'webauthn';
  credentialId: string;
  prfSalt: string;
  wrappedKey: CipherBlob;
  createdAt: string;
}

/** Desktop app: DEK in a device-bound Keychain item; Electron gates access with promptTouchID (no item biometric ACL). */
export interface NativeTouchIdWrap {
  kind: 'native';
  createdAt: string;
}

export type TouchIdWrap = WebAuthnTouchIdWrap | NativeTouchIdWrap;

export interface VaultMeta {
  version: 2;
  kdf: KdfParams;
  /** DEK wrapped with the password-derived key. */
  wrappedKey: CipherBlob;
  touchId?: TouchIdWrap;
  createdAt: string;
}

/** Self-describing encrypted backup: restorable with only this file + the password. */
export interface EncryptedBackupFile {
  format: typeof BACKUP_FORMAT;
  version: 2;
  kdf: KdfParams;
  wrappedKey: CipherBlob;
  cipher: CipherBlob;
  createdAt: string;
}

export class WrongPasswordError extends Error {
  constructor(message = '密码不正确。') {
    super(message);
    this.name = 'WrongPasswordError';
  }
}

export class WeakPasswordError extends Error {
  constructor() {
    super(`密码至少需要 ${MIN_PASSWORD_LENGTH} 个字符。`);
    this.name = 'WeakPasswordError';
  }
}

function subtle(): SubtleCrypto {
  const api = globalThis.crypto?.subtle;
  if (!api) throw new Error('此浏览器不支持 WebCrypto，无法使用加密档案。');
  return api;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/** Password -> key-encryption key (non-extractable). */
export async function deriveKey(password: string, kdf: KdfParams): Promise<CryptoKey> {
  const material = await subtle().importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(kdf.salt), iterations: kdf.iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptBytes(key: CryptoKey, bytes: Uint8Array<ArrayBuffer>, aad: Uint8Array<ArrayBuffer>): Promise<CipherBlob> {
  const iv = randomBytes(12);
  const ciphertext = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, bytes);
  return { alg: 'AES-GCM', iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) };
}

async function decryptBytes(key: CryptoKey, blob: CipherBlob, aad: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  try {
    const plain = await subtle().decrypt({ name: 'AES-GCM', iv: fromBase64(blob.iv), additionalData: aad }, key, fromBase64(blob.ciphertext));
    return new Uint8Array(plain);
  } catch {
    throw new WrongPasswordError();
  }
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<CipherBlob> {
  return encryptBytes(key, new TextEncoder().encode(JSON.stringify(value)), DATA_AAD);
}

/** Throws WrongPasswordError when authentication fails (wrong key or tampered data). */
export async function decryptJson(key: CryptoKey, blob: CipherBlob): Promise<unknown> {
  return JSON.parse(new TextDecoder().decode(await decryptBytes(key, blob, DATA_AAD)));
}

export function assertPasswordStrength(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) throw new WeakPasswordError();
}

/** Import raw DEK bytes as a non-extractable data key. */
export async function importDataKey(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return subtle().importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function wrapRawKey(kek: CryptoKey, raw: Uint8Array<ArrayBuffer>): Promise<CipherBlob> {
  return encryptBytes(kek, raw, DEK_AAD);
}

export async function unwrapRawKey(kek: CryptoKey, wrapped: CipherBlob): Promise<Uint8Array<ArrayBuffer>> {
  const raw = await decryptBytes(kek, wrapped, DEK_AAD);
  if (raw.length !== 32) throw new WrongPasswordError();
  return raw;
}

export interface UnlockedVault {
  meta: VaultMeta;
  key: CryptoKey;
  /**
   * Raw DEK bytes, returned only so the caller can immediately offer Touch ID enrollment.
   * Callers must call `.fill(0)` when done and never persist it.
   */
  rawKey: Uint8Array<ArrayBuffer>;
}

/** First-time setup: new random salt + random DEK. */
export async function createVault(password: string, iterations = PBKDF2_ITERATIONS): Promise<UnlockedVault> {
  assertPasswordStrength(password);
  const kdf: KdfParams = { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toBase64(randomBytes(16)) };
  const kek = await deriveKey(password, kdf);
  const rawKey = randomBytes(32);
  const meta: VaultMeta = { version: 2, kdf, wrappedKey: await wrapRawKey(kek, rawKey), createdAt: new Date().toISOString() };
  return { meta, key: await importDataKey(rawKey), rawKey };
}

export async function unlockVault(meta: VaultMeta, password: string): Promise<UnlockedVault> {
  const kek = await deriveKey(password, meta.kdf);
  const rawKey = await unwrapRawKey(kek, meta.wrappedKey);
  return { meta, key: await importDataKey(rawKey), rawKey };
}

function isKdf(value: unknown): value is KdfParams {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<KdfParams>;
  return v.name === 'PBKDF2' && v.hash === 'SHA-256' && typeof v.salt === 'string'
    && typeof v.iterations === 'number' && v.iterations >= 100_000;
}

export function isCipherBlob(value: unknown): value is CipherBlob {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<CipherBlob>;
  return v.alg === 'AES-GCM' && typeof v.iv === 'string' && typeof v.ciphertext === 'string';
}

function isTouchIdWrap(value: unknown): value is TouchIdWrap {
  if (!value || typeof value !== 'object') return false;
  if ((value as { kind?: unknown }).kind === 'native') return typeof (value as { createdAt?: unknown }).createdAt === 'string';
  const v = value as Partial<WebAuthnTouchIdWrap>;
  return typeof v.credentialId === 'string' && typeof v.prfSalt === 'string' && isCipherBlob(v.wrappedKey);
}

export function isVaultMeta(value: unknown): value is VaultMeta {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<VaultMeta>;
  return v.version === 2 && isKdf(v.kdf) && isCipherBlob(v.wrappedKey) && (v.touchId === undefined || isTouchIdWrap(v.touchId));
}

export function isEncryptedBackupFile(value: unknown): value is EncryptedBackupFile {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<EncryptedBackupFile>;
  return v.format === BACKUP_FORMAT && v.version === 2 && isKdf(v.kdf) && isCipherBlob(v.wrappedKey) && isCipherBlob(v.cipher);
}

/** Backup = password-wrapped DEK + record ciphertext. Touch ID wrap is device-bound and never exported. */
export async function buildBackupFile(meta: VaultMeta, key: CryptoKey, record: unknown): Promise<EncryptedBackupFile> {
  return {
    format: BACKUP_FORMAT,
    version: 2,
    kdf: meta.kdf,
    wrappedKey: meta.wrappedKey,
    cipher: await encryptJson(key, record),
    createdAt: new Date().toISOString(),
  };
}

/** Restore on any browser/Mac with the file + password only. */
export async function openBackupFile(file: EncryptedBackupFile, password: string): Promise<{ record: unknown; meta: VaultMeta; key: CryptoKey; rawKey: Uint8Array<ArrayBuffer> }> {
  const kek = await deriveKey(password, file.kdf);
  const rawKey = await unwrapRawKey(kek, file.wrappedKey);
  const key = await importDataKey(rawKey);
  const record = await decryptJson(key, file.cipher).catch(() => {
    throw new WrongPasswordError('备份文件已损坏或被修改。');
  });
  return {
    record,
    key,
    rawKey,
    meta: { version: 2, kdf: file.kdf, wrappedKey: file.wrappedKey, createdAt: new Date().toISOString() },
  };
}
