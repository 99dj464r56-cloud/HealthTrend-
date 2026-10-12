import { migrateHealthRecord } from '../domain/migrate';
import { validateHealthRecord } from '../domain/validation';
import type { HealthRecord } from '../domain/types';

const HEADERS = { 'X-Health-Backup': '1' };

function apiBase(): string {
  const base = import.meta.env.BASE_URL || '/';
  return base.endsWith('/') ? base : `${base}/`;
}

/** Fetch a retained plaintext restore drop from the localhost backup middleware (null if none). */
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

/** Empty means no profile and no data in any schema collection. */
export function isSparseRecord(record: HealthRecord | null | undefined): boolean {
  if (!record) return true;
  return Object.values(record.profile).every(value => !value)
    && Object.values(record).filter(Array.isArray).every(items => items.length === 0);
}

export async function restorePendingRecord(current: HealthRecord, raw: unknown, io: {
  confirm: (message: string) => boolean | Promise<boolean>;
  save: (record: HealthRecord, expected: HealthRecord) => Promise<void>;
  load: () => Promise<HealthRecord | null>;
}): Promise<HealthRecord | null> {
  if (!isSparseRecord(current)) return null;
  const pending = validateHealthRecord(migrateHealthRecord(raw));
  if (isSparseRecord(pending)) return null;
  const counts = Object.entries(pending).filter(([, value]) => Array.isArray(value))
    .map(([key, value]) => `${key}: ${(value as unknown[]).length}`).join('，');
  if (!await io.confirm(`发现待恢复档案：${pending.profile.displayName || '未填写姓名'}。\n${counts}\n确认导入当前空档案？源文件将保留，请核对身份。`)) return null;
  await io.save(pending, current);
  try {
    const verified = await io.load();
    if (JSON.stringify(verified) !== JSON.stringify(pending)) throw new Error('恢复读回核验失败');
    return verified;
  } catch (error) {
    await io.save(current, pending);
    throw error;
  }
}
