import { migrateHealthRecord, needsSchemaRewrite } from '../domain/migrate';
import { validateHealthRecord, HealthRecordValidationError } from '../domain/validation';
import type { HealthRecord } from '../domain/types';

const DATABASE_NAME = 'health-trend-pdf';
const DATABASE_VERSION = 1;
const STORE_NAME = 'records';
const CURRENT_RECORD_KEY = 'current';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local health storage.'));
  });
}

async function runTransaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
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
  await runTransaction('readwrite', (store) => store.put(confirmedRecord, CURRENT_RECORD_KEY));
}

/**
 * Load the local record, migrating legacy schemas → v3 in memory.
 * On migrate/validate failure the raw IndexedDB bytes are left untouched (no destructive rewrite).
 * After a successful v1 migrate, attempts to persist v3; persist failure still returns the migrated record.
 */
export async function loadHealthRecord(): Promise<HealthRecord | null> {
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
      // Leave legacy bytes in place; caller still receives a valid in-memory v3 record.
    }
  }

  return migrated;
}

export async function clearHealthRecord(): Promise<void> {
  await runTransaction('readwrite', (store) => store.clear());
}

/** Test/helper: write an arbitrary payload without validation (simulates legacy disk state). */
export async function putRawHealthRecordForTests(raw: unknown): Promise<void> {
  await runTransaction('readwrite', (store) => store.put(raw, CURRENT_RECORD_KEY));
}
