import { migrateHealthRecord } from '../domain/migrate';
import { validateHealthRecord } from '../domain/validation';
import type { HealthRecord } from '../domain/types';

/** Committed synthetic seed — safe to ship; never contains real personal data. */
export function demoSeedUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${prefix}seeds/demo-record.json`;
}

export async function fetchDemoSeedRecord(): Promise<HealthRecord | null> {
  try {
    const response = await fetch(demoSeedUrl(), { cache: 'no-store' });
    if (!response.ok) return null;
    const raw: unknown = await response.json();
    return validateHealthRecord(migrateHealthRecord(raw));
  } catch {
    return null;
  }
}
