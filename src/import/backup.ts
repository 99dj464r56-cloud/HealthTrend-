import { migrateHealthRecord, needsSchemaRewrite } from '../domain/migrate';
import { validateHealthRecord } from '../domain/validation';
import type { HealthRecord } from '../domain/types';

const MAX_BACKUP_SIZE = 25 * 1024 * 1024;

/** Optional encrypted backups are not implemented in this release. */
export const BACKUP_ENCRYPTION_SUPPORTED = false as const;

export type BackupImportStrategy = 'replace-all' | 'cancel';

export interface BackupCounts {
  medications: number;
  regimenStages: number;
  indicators: number;
  observations: number;
  reportTextBlocks: number;
  appleHealthRecords: number;
  sources: number;
}

export interface BackupPreview {
  fileName: string;
  rawSchemaVersion: unknown;
  migratedSchemaVersion: 4;
  migrateRequired: boolean;
  profileDisplayName: string;
  identityConfirmed: boolean;
  counts: BackupCounts;
  /** Strategies offered to the user. Encrypted import is not available. */
  strategyOptions: BackupImportStrategy[];
  encryptionSupported: false;
  notes: string[];
}

function countRecord(record: HealthRecord): BackupCounts {
  return {
    medications: record.medications.length,
    regimenStages: record.regimenStages.length,
    indicators: record.indicators.length,
    observations: record.observations.length,
    reportTextBlocks: record.reportTextBlocks.length,
    appleHealthRecords: record.appleHealthRecords.length,
    sources: record.sources.length,
  };
}

export function exportBackup(record: HealthRecord): Blob {
  const reviewed = validateHealthRecord(record);
  const json = `${JSON.stringify(reviewed, null, 2)}\n`;
  return new Blob([json], { type: 'application/json;charset=utf-8' });
}

async function readBackupJson(file: File): Promise<unknown> {
  if (file.size > MAX_BACKUP_SIZE) throw new Error('Backup file is too large (maximum 25 MiB).');
  try {
    return JSON.parse(await file.text()) as unknown;
  } catch {
    throw new Error('Backup file is not valid JSON.');
  }
}

/**
 * Parse and validate a backup. Does not write to IndexedDB — callers must commit explicitly.
 * Legacy schemas are migrated in-memory first.
 */
export async function parseBackup(file: File): Promise<HealthRecord> {
  const parsed = await readBackupJson(file);
  return validateHealthRecord(migrateHealthRecord(parsed));
}

/**
 * Preview a backup before any local write. Failed preview/parse never touches IndexedDB.
 */
export async function previewBackup(file: File): Promise<{ preview: BackupPreview; record: HealthRecord }> {
  const raw = await readBackupJson(file);
  const migrateRequired = needsSchemaRewrite(raw);
  const record = validateHealthRecord(migrateHealthRecord(raw));
  const rawVersion = (raw && typeof raw === 'object' && 'schemaVersion' in raw)
    ? (raw as { schemaVersion: unknown }).schemaVersion
    : undefined;
  const notes = [
    migrateRequired
      ? `备份 schema ${String(rawVersion)} 将迁移为 v${record.schemaVersion} 后再导入。`
      : `备份已是 schema v${record.schemaVersion}。`,
    '当前策略：替换本机全部记录（replace-all）。取消则不做任何写入。',
    BACKUP_ENCRYPTION_SUPPORTED
      ? '支持加密备份。'
      : '可选加密导出尚未实现；请将明文 JSON 备份视为敏感资料妥善保管。',
  ];
  return {
    record,
    preview: {
      fileName: file.name,
      rawSchemaVersion: rawVersion,
      migratedSchemaVersion: 4,
      migrateRequired,
      profileDisplayName: record.profile.displayName,
      identityConfirmed: record.profile.identityConfirmed,
      counts: countRecord(record),
      strategyOptions: ['replace-all', 'cancel'],
      encryptionSupported: false,
      notes,
    },
  };
}

/**
 * Apply a chosen conflict strategy. Only `replace-all` writes a new record object;
 * `cancel` returns the current record unchanged. Never mutates IndexedDB itself.
 */
export function applyBackupImportStrategy(
  current: HealthRecord | null,
  incoming: HealthRecord,
  strategy: BackupImportStrategy,
): HealthRecord | null {
  if (strategy === 'cancel') return current;
  if (strategy === 'replace-all') return incoming;
  return current;
}

export function formatBackupPreviewSummary(preview: BackupPreview): string {
  const c = preview.counts;
  return [
    `文件：${preview.fileName}`,
    `档案：${preview.profileDisplayName || '（未命名）'}（身份已确认：${preview.identityConfirmed ? '是' : '否'}）`,
    `Schema：${String(preview.rawSchemaVersion)} → v${preview.migratedSchemaVersion}${preview.migrateRequired ? '（需迁移）' : ''}`,
    `药物 ${c.medications} · 用药阶段 ${c.regimenStages} · 指标 ${c.indicators} · 观察值 ${c.observations}`,
    `报告文字 ${c.reportTextBlocks} · Apple 健康 ${c.appleHealthRecords} · 来源 ${c.sources}`,
    ...preview.notes,
  ].join('\n');
}
