import { migrateHealthRecord } from '../domain/migrate';
import { validateHealthRecord } from '../domain/validation';
import type { HealthRecord } from '../domain/types';

const HEADERS = { 'X-Health-Backup': '1' };

function apiBase(): string {
  const base = import.meta.env.BASE_URL || '/';
  return base.endsWith('/') ? base : `${base}/`;
}

/** Fetch a one-shot plaintext restore drop from the localhost backup middleware (null if none). */
export async function fetchPendingRestore(): Promise<HealthRecord | null> {
  try {
    const response = await fetch(`${apiBase()}__backup/pending-restore`, { headers: HEADERS, cache: 'no-store' });
    if (!response.ok) return null;
    const raw: unknown = await response.json();
    return validateHealthRecord(migrateHealthRecord(raw));
  } catch {
    return null;
  }
}

export async function clearPendingRestore(): Promise<void> {
  try {
    await fetch(`${apiBase()}__backup/pending-restore`, { method: 'DELETE', headers: HEADERS });
  } catch {
    // ignore
  }
}

export function isSparseRecord(record: HealthRecord | null | undefined): boolean {
  if (!record) return true;
  return !record.medications.length && !record.indicators.length && !record.observations.length;
}
