import { validateHealthRecord } from '../domain/validation';
import type { HealthRecord } from '../domain/types';

const MAX_BACKUP_SIZE = 25 * 1024 * 1024;

export function exportBackup(record: HealthRecord): Blob {
  const reviewed = validateHealthRecord(record);
  const json = `${JSON.stringify(reviewed, null, 2)}\n`;
  return new Blob([json], { type: 'application/json;charset=utf-8' });
}

export async function parseBackup(file: File): Promise<HealthRecord> {
  if (file.size > MAX_BACKUP_SIZE) throw new Error('Backup file is too large (maximum 25 MiB).');
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text()) as unknown;
  } catch {
    throw new Error('Backup file is not valid JSON.');
  }
  return validateHealthRecord(parsed);
}
