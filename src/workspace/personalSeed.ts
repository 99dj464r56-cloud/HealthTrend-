import { migrateHealthRecord } from '../domain/migrate';
import { validateHealthRecord } from '../domain/validation';
import type { HealthRecord } from '../domain/types';

/**
 * Local-only personal seed from public/seeds/ (gitignored real backup).
 * Guest mode must never call this.
 * // Demo seed for guest: not enabled by default — keep guest DB empty on first open.
 */
export function personalSeedUrl(): string {
  // Share builds: statically replaced -> the seed path is dead code and never bundled.
  if (import.meta.env.VITE_SHARE_BUILD === '1') return '';
  const base = import.meta.env.BASE_URL || '/';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${prefix}seeds/personal-backup.json`;
}

/** Share builds (and tests) never load a personal seed. */
export function personalSeedDisabled(): boolean {
  return import.meta.env.VITE_SHARE_BUILD === '1' || import.meta.env.VITE_DISABLE_PERSONAL_SEED === '1';
}

export async function fetchPersonalSeedRecord(): Promise<HealthRecord | null> {
  if (import.meta.env.VITE_SHARE_BUILD === '1' || personalSeedDisabled()) return null;
  try {
    const response = await fetch(personalSeedUrl(), { cache: 'no-store' });
    if (!response.ok) return null;
    const raw: unknown = await response.json();
    return validateHealthRecord(migrateHealthRecord(raw));
  } catch {
    return null;
  }
}
