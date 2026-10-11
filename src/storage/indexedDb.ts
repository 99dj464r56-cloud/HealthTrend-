import { validateHealthRecord } from '../domain/validation';
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

export async function saveHealthRecord(record: HealthRecord): Promise<void> {
  const confirmedRecord = validateHealthRecord(record);
  await runTransaction('readwrite', (store) => store.put(confirmedRecord, CURRENT_RECORD_KEY));
}

export async function loadHealthRecord(): Promise<HealthRecord | null> {
  const result = await runTransaction('readonly', (store) => store.get(CURRENT_RECORD_KEY));
  return result === undefined ? null : validateHealthRecord(result);
}

export async function clearHealthRecord(): Promise<void> {
  await runTransaction('readwrite', (store) => store.clear());
}
