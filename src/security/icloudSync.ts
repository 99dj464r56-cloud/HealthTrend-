/**
 * Minimal-tap iCloud sync between devices using the fixed encrypted backup file
 * (health-trend-personal.enc.json). Each device keeps its own IndexedDB; this module
 * only decides which copy is newer and remembers the last file this device synced.
 * No password or key is ever stored here.
 */
import { getSetting, putSetting } from '../storage/indexedDb';
import { isEncryptedBackupFile, type EncryptedBackupFile } from './vault';

const LAST_SYNCED = 'icloud-sync-last-created-at';
const LAST_SYNCED_LOCAL = 'icloud-sync-local-updated-at';
const PASSWORD_USED = 'icloud-sync-password-used';
const LAUNCH_DISMISSED = 'icloud-sync-launch-dismissed';

/** 'conflict': file is newer, but this device also changed since its last sync. */
export type SyncFreshness = 'file-newer' | 'conflict' | 'local-newer' | 'same' | 'local-unknown';

function time(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Compare the backup file's export time against the local record's last change.
 * A file this device itself last saved/restored counts as 'same' (no re-prompt).
 * When the file is newer but local data also changed after the last sync, returns 'conflict'.
 */
export function compareSyncFreshness(input: {
  fileCreatedAt: string;
  localUpdatedAt: string | null | undefined;
  lastSyncedCreatedAt?: string | null;
  /** Local updatedAt recorded right after the last save/restore on this device. */
  lastSyncedLocalUpdatedAt?: string | null;
}): SyncFreshness {
  if (input.lastSyncedCreatedAt && input.lastSyncedCreatedAt === input.fileCreatedAt) return 'same';
  const file = time(input.fileCreatedAt);
  const local = time(input.localUpdatedAt);
  if (local === null) return 'local-unknown';
  if (file === null) return 'local-newer';
  if (file > local) {
    const syncedLocal = time(input.lastSyncedLocalUpdatedAt);
    return syncedLocal !== null && local > syncedLocal ? 'conflict' : 'file-newer';
  }
  if (file < local) return 'local-newer';
  return 'same';
}

export function formatSyncTime(value: string | null | undefined): string {
  const parsed = time(value);
  if (parsed === null) return '未知';
  return new Date(parsed).toLocaleString('zh-CN', { hour12: false });
}

export function describeFreshness(freshness: SyncFreshness, fileCreatedAt: string, localUpdatedAt: string | null | undefined): string {
  const times = `iCloud 文件导出于 ${formatSyncTime(fileCreatedAt)}；本机最后修改于 ${formatSyncTime(localUpdatedAt)}。`;
  switch (freshness) {
    case 'file-newer': return `${times}iCloud 文件较新。`;
    case 'conflict': return `${times}iCloud 文件较新，但本机在上次同步后也有修改；覆盖会丢失这些本机修改。`;
    case 'local-newer': return `${times}本机资料较新，覆盖会丢失本机较新的修改。`;
    case 'same': return `${times}这份文件与本机上次同步的是同一份，资料应已一致。`;
    default: return `${times}无法判断本机资料的修改时间（旧版档案）。`;
  }
}

/** Parse envelope text; returns null when it is not an encrypted HealthTrend backup. */
export function parseEnvelopeText(text: string | null | undefined): EncryptedBackupFile | null {
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return isEncryptedBackupFile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function getLastSyncedCreatedAt(): Promise<string | null> {
  return (await getSetting<string>(LAST_SYNCED).catch(() => undefined)) ?? null;
}

export async function getSyncState(): Promise<{ lastSyncedCreatedAt: string | null; lastSyncedLocalUpdatedAt: string | null }> {
  return {
    lastSyncedCreatedAt: await getLastSyncedCreatedAt(),
    lastSyncedLocalUpdatedAt: (await getSetting<string>(LAST_SYNCED_LOCAL).catch(() => undefined)) ?? null,
  };
}

/** Remember the file this device just saved or restored, its local timestamp, and that a sync password exists. */
export async function markSynced(fileCreatedAt: string, localUpdatedAt: string | null | undefined): Promise<void> {
  await putSetting(LAST_SYNCED, fileCreatedAt);
  await putSetting(LAST_SYNCED_LOCAL, localUpdatedAt ?? null);
  await putSetting(PASSWORD_USED, true);
}

export async function syncPasswordUsedBefore(): Promise<boolean> {
  return (await getSetting<boolean>(PASSWORD_USED).catch(() => undefined)) === true;
}

/** Mac launch prompt: skip a file the user already declined once. */
export async function launchPromptDismissedFor(fileCreatedAt: string): Promise<boolean> {
  return (await getSetting<string>(LAUNCH_DISMISSED).catch(() => undefined)) === fileCreatedAt;
}

export async function dismissLaunchPrompt(fileCreatedAt: string): Promise<void> {
  await putSetting(LAUNCH_DISMISSED, fileCreatedAt);
}
