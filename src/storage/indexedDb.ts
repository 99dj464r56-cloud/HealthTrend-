import { migrateHealthRecord, needsSchemaRewrite } from '../domain/migrate';
import { validateHealthRecord, HealthRecordValidationError } from '../domain/validation';
import type { HealthRecord } from '../domain/types';
import { WORKSPACE_DB, type WorkspaceMode } from '../workspace/mode';
import { decryptJson, encryptJson, isCipherBlob, isVaultMeta, type VaultMeta } from '../security/vault';

const DATABASE_VERSION = 1;
const STORE_NAME = 'records';
const CURRENT_RECORD_KEY = 'current';
/** AES-GCM ciphertext of the record (personal mode after a password is set). */
const ENCRYPTED_RECORD_KEY = 'current-enc';
const VAULT_META_KEY = 'vault';

/** In-memory only; never persisted. */
let sessionKey: CryptoKey | null = null;

export class VaultLockedError extends Error {
  constructor() {
    super('档案已加密锁定，请先输入密码解锁。');
    this.name = 'VaultLockedError';
  }
}

export function setSessionKey(key: CryptoKey | null): void {
  sessionKey = key;
}

export function hasSessionKey(): boolean {
  return sessionKey !== null;
}

/** Default = personal DB (`health-trend-pdf`) for backward-compatible tests/callers. */
let activeDatabaseName: string = WORKSPACE_DB.personal;

export function setActiveWorkspace(mode: WorkspaceMode): void {
  activeDatabaseName = WORKSPACE_DB[mode];
}

export function getActiveDatabaseName(): string {
  return activeDatabaseName;
}

function openDatabase(databaseName = activeDatabaseName): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local health storage.'));
  });
}

async function runTransaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
  databaseName = activeDatabaseName,
): Promise<T> {
  const database = await openDatabase(databaseName);
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    let result: T;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error ?? new Error('Could not access local health storage.'));
    transaction.oncomplete = () => {
      database.close();
      resolve(result!);
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error('Local health storage transaction was cancelled.'));
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error('Could not access local health storage.'));
    };
  });
}

async function getRawRecord(): Promise<unknown> {
  return runTransaction('readonly', (store) => store.get(CURRENT_RECORD_KEY));
}

export async function saveHealthRecord(record: HealthRecord): Promise<void> {
  const confirmedRecord = validateHealthRecord(record);
  if (sessionKey) {
    const blob = await encryptJson(sessionKey, confirmedRecord);
    await runTransaction('readwrite', (store) => {
      store.put(blob, ENCRYPTED_RECORD_KEY);
      // Remove any plaintext copy so the record exists only as ciphertext at rest.
      return store.delete(CURRENT_RECORD_KEY);
    });
    return;
  }
  if (await getVaultMeta()) throw new VaultLockedError();
  await runTransaction('readwrite', (store) => store.put(confirmedRecord, CURRENT_RECORD_KEY));
}

/**
 * Load the local record for the active workspace DB, migrating legacy schemas in memory.
 * On migrate/validate failure the raw IndexedDB bytes are left untouched.
 */
export async function loadHealthRecord(): Promise<HealthRecord | null> {
  const encrypted = await runTransaction<unknown>('readonly', (store) => store.get(ENCRYPTED_RECORD_KEY));
  if (encrypted !== undefined) {
    if (!sessionKey) throw new VaultLockedError();
    if (!isCipherBlob(encrypted)) throw new HealthRecordValidationError('加密档案格式无效，原始数据未改动。');
    return validateHealthRecord(migrateHealthRecord(await decryptJson(sessionKey, encrypted)));
  }
  if (await getVaultMeta()) {
    // Vault exists but no ciphertext yet (e.g. cleared): treat as empty, never fall back to plaintext.
    if (!sessionKey) throw new VaultLockedError();
    return null;
  }
  const raw = await getRawRecord();
  if (raw === undefined) return null;

  let migrated: HealthRecord;
  try {
    migrated = validateHealthRecord(migrateHealthRecord(raw));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Local health record could not be migrated.';
    throw new HealthRecordValidationError(
      `${message} The original local record was left unchanged.`,
    );
  }

  if (needsSchemaRewrite(raw)) {
    try {
      await runTransaction('readwrite', (store) => store.put(migrated, CURRENT_RECORD_KEY));
    } catch {
      // Leave legacy bytes in place; caller still receives a valid in-memory record.
    }
  }

  return migrated;
}

/** Clears the record (plaintext and ciphertext) but keeps vault metadata and settings. */
export async function clearHealthRecord(): Promise<void> {
  await runTransaction('readwrite', (store) => {
    store.delete(ENCRYPTED_RECORD_KEY);
    return store.delete(CURRENT_RECORD_KEY);
  });
}

export async function getVaultMeta(): Promise<VaultMeta | null> {
  const value = await runTransaction<unknown>('readonly', (store) => store.get(VAULT_META_KEY));
  return isVaultMeta(value) ? value : null;
}

/**
 * Create/replace the vault and encrypt `record` with `key` in one transaction.
 * Any plaintext copy of the record is deleted (migration on first password setup).
 */
export async function initializeVault(meta: VaultMeta, key: CryptoKey, record: HealthRecord): Promise<void> {
  const confirmedRecord = validateHealthRecord(record);
  const blob = await encryptJson(key, confirmedRecord);
  await runTransaction('readwrite', (store) => {
    store.put(meta, VAULT_META_KEY);
    store.put(blob, ENCRYPTED_RECORD_KEY);
    return store.delete(CURRENT_RECORD_KEY);
  });
  sessionKey = key;
}

/** Update vault metadata (e.g. add/remove Touch ID wrap). */
export async function putVaultMeta(meta: VaultMeta): Promise<void> {
  await runTransaction('readwrite', (store) => store.put(meta, VAULT_META_KEY));
}

/** Plaintext record (pre-vault) for migration preview; null if absent or encrypted. */
export async function loadPlaintextRecordForMigration(): Promise<HealthRecord | null> {
  if (await getVaultMeta()) return null;
  const raw = await getRawRecord();
  if (raw === undefined) return null;
  return validateHealthRecord(migrateHealthRecord(raw));
}

/** Generic settings value (e.g. persisted backup folder handle). */
export async function getSetting<T>(name: string): Promise<T | undefined> {
  return runTransaction<T>('readonly', (store) => store.get(`setting:${name}`));
}

export async function putSetting(name: string, value: unknown): Promise<void> {
  await runTransaction('readwrite', (store) => store.put(value, `setting:${name}`));
}

/** Test helper: raw stored values for at-rest assertions. */
export async function readRawEntryForTests(name: 'current' | 'current-enc' | 'vault'): Promise<unknown> {
  return runTransaction<unknown>('readonly', (store) => store.get(name));
}

/** Test/helper: write an arbitrary payload without validation (simulates legacy disk state). */
export async function putRawHealthRecordForTests(raw: unknown): Promise<void> {
  await runTransaction('readwrite', (store) => store.put(raw, CURRENT_RECORD_KEY));
}
