import type { HealthRecord } from '../domain/types';
import { migrateHealthRecord } from '../domain/migrate';
import { validateHealthRecord } from '../domain/validation';
import { buildBackupFile, createVault, isEncryptedBackupFile, openBackupFile, type EncryptedBackupFile } from '../security/vault';

const MAX_BACKUP_BYTES = 25 * 1024 * 1024;

/** Password is used for this file only, never saved or required for daily access. */
export async function exportEncryptedBackup(record: HealthRecord, password: string): Promise<EncryptedBackupFile> {
  const reviewed = validateHealthRecord(record);
  const vault = await createVault(password);
  try {
    const backup = await buildBackupFile(vault.meta, vault.key, reviewed);
    if (new Blob([`${JSON.stringify(backup)}\n`]).size > MAX_BACKUP_BYTES) {
      throw new Error('加密备份超过 25 MiB，无法生成可恢复的文件。请先减少档案中的大型导入内容，再重新备份；当前本机资料未改变。');
    }
    return backup;
  } finally {
    vault.rawKey.fill(0);
  }
}

export async function restoreEncryptedBackup(file: File, password: string): Promise<HealthRecord> {
  if (file.size > MAX_BACKUP_BYTES) throw new Error('备份文件过大（最大 25 MiB）。');
  let parsed: unknown;
  try { parsed = JSON.parse(await file.text()); }
  catch { throw new Error('无法读取该文件：不是有效的 JSON。'); }
  if (!isEncryptedBackupFile(parsed)) throw new Error('该文件不是 HealthTrend 加密备份。');
  // Bound attacker-controlled work before deriving a key from an imported envelope.
  if (!Number.isSafeInteger(parsed.kdf.iterations) || parsed.kdf.iterations > 2_000_000) {
    throw new Error('备份文件的加密参数无效。');
  }
  const opened = await openBackupFile(parsed, password);
  try {
    return validateHealthRecord(migrateHealthRecord(opened.record));
  } finally {
    opened.rawKey.fill(0);
  }
}
