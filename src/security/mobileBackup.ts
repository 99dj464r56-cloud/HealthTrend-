/**
 * Mobile / browser fallback for encrypted backups when the desktop Node backup
 * path and File System Access API are unavailable (typical of iPhone Safari).
 *
 * Offers: download / share `health-trend-personal.enc.json` (user saves to 文件 → iCloud),
 * and tracks explicit save confirmation separately from file emission.
 */
import { getSetting, putSetting } from '../storage/indexedDb';
import { BACKUP_FILE_NAME, isServerBackupEnabled, folderPickerSupported } from './backupClient';
import { nativeBridge } from '../native/bridge';
import type { EncryptedBackupFile } from './vault';
import { isEncryptedBackupFile } from './vault';

const LAST_AT = 'mobile-backup-confirmed-at-v2';
const CONFIRMED = 'mobile-backup-confirmed-revision';
const ATTEMPT = 'mobile-backup-emitted';
const CHANGE_COUNT = 'mobile-backup-changes-since';
const STALE_MS = 2 * 24 * 60 * 60 * 1000;
const STALE_CHANGES = 5;

export function needsManualBackupUi(): boolean {
  if (nativeBridge()) return false;
  // Desktop Chromium with picker or localhost middleware can auto-write; mobile Safari cannot.
  if (typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) return true;
  // Also show as fallback when neither server nor folder picker is available (checked async by caller).
  return false;
}

export async function shouldOfferManualBackupBanner(): Promise<boolean> {
  if (nativeBridge()) return false;
  if (await isServerBackupEnabled()) return false;
  if (folderPickerSupported() && !needsManualBackupUi()) return false;
  return true;
}

export async function getBackupRevision(): Promise<number> {
  return (await getSetting<number>(CHANGE_COUNT)) ?? 0;
}

export async function recordMobileBackupSuccess(revision?: number): Promise<void> {
  const captured = revision ?? await getBackupRevision();
  const previous = (await getSetting<number>(CONFIRMED)) ?? 0;
  await putSetting(CONFIRMED, Math.max(previous, captured));
  await putSetting(LAST_AT, new Date().toISOString());
}

export async function confirmMobileBackupSaved(): Promise<void> {
  const attempt = await getSetting<{ revision: number }>(ATTEMPT);
  if (!attempt) throw new Error('请先生成加密备份文件。');
  await recordMobileBackupSuccess(attempt.revision);
  await putSetting(ATTEMPT, null);
}

export async function hasUnconfirmedBackup(): Promise<boolean> {
  return Boolean(await getSetting(ATTEMPT));
}

export async function bumpMobileBackupChanges(): Promise<number> {
  const next = await getBackupRevision() + 1;
  await putSetting(CHANGE_COUNT, next);
  return next;
}

export async function mobileBackupStale(): Promise<{ stale: boolean; reason: string | null; lastAt: string | null; changes: number }> {
  const lastAt = (await getSetting<string>(LAST_AT)) ?? null;
  const changes = Math.max(0, await getBackupRevision() - ((await getSetting<number>(CONFIRMED)) ?? 0));
  if (!lastAt) return { stale: true, reason: '尚未确认保存加密备份', lastAt: null, changes };
  const age = Date.now() - Date.parse(lastAt);
  if (Number.isFinite(age) && age > STALE_MS) {
    return { stale: true, reason: '距上次确认保存已超过 2 天', lastAt, changes };
  }
  if (changes >= STALE_CHANGES) {
    return { stale: true, reason: `已有 ${changes} 处改动尚未备份`, lastAt, changes };
  }
  return { stale: false, reason: null, lastAt, changes };
}

/** Trigger download / iOS share sheet for an already-encrypted envelope. */
export async function shareEncryptedBackupFile(file: EncryptedBackupFile, revision?: number): Promise<'share' | 'download'> {
  if (!isEncryptedBackupFile(file)) throw new Error('只能分享加密备份。');
  const captured = revision ?? await getBackupRevision();
  const emitted = async (method: string) => putSetting(ATTEMPT, { revision: captured, method, createdAt: new Date().toISOString() });
  const blob = new Blob([`${JSON.stringify(file)}\n`], { type: 'application/json' });
  const shareFile = typeof File !== 'undefined'
    ? new File([blob], BACKUP_FILE_NAME, { type: 'application/json' })
    : null;
  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void>; canShare?: (data: ShareData) => boolean };
  if (shareFile && nav.share && (!nav.canShare || nav.canShare({ files: [shareFile] }))) {
    try {
      await nav.share({
        files: [shareFile],
        title: 'HealthTrend 加密备份',
        text: '请选取「存储到文件」→ iCloud 云盘（例如 日常调阅等备份文件夹）。',
      });
      await emitted('share');
      return 'share';
    } catch (error) {
      // User cancel → fall through to download; AbortError should not look like failure.
      if ((error as { name?: string }).name === 'AbortError') throw error;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = BACKUP_FILE_NAME;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  await emitted('download');
  return 'download';
}

