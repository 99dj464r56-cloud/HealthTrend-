/**
 * Mobile / browser fallback for encrypted backups when the desktop Node backup
 * path and File System Access API are unavailable (typical of iPhone Safari).
 *
 * Offers: download / share `health-trend-personal.enc.json` (user saves to 文件 → iCloud),
 * and tracks last-success + change count for stale reminders.
 */
import { getSetting, putSetting } from '../storage/indexedDb';
import { BACKUP_FILE_NAME, isServerBackupEnabled, folderPickerSupported } from './backupClient';
import { nativeBridge } from '../native/bridge';
import type { EncryptedBackupFile } from './vault';
import { isEncryptedBackupFile } from './vault';

const LAST_AT = 'mobile-backup-last-at';
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

export async function recordMobileBackupSuccess(): Promise<void> {
  await putSetting(LAST_AT, new Date().toISOString());
  await putSetting(CHANGE_COUNT, 0);
}

export async function bumpMobileBackupChanges(): Promise<number> {
  const prev = (await getSetting<number>(CHANGE_COUNT)) ?? 0;
  const next = prev + 1;
  await putSetting(CHANGE_COUNT, next);
  return next;
}

export async function mobileBackupStale(): Promise<{ stale: boolean; reason: string | null; lastAt: string | null; changes: number }> {
  const lastAt = (await getSetting<string>(LAST_AT)) ?? null;
  const changes = (await getSetting<number>(CHANGE_COUNT)) ?? 0;
  if (!lastAt) return { stale: true, reason: '尚未备份到 iCloud／文件', lastAt: null, changes };
  const age = Date.now() - Date.parse(lastAt);
  if (Number.isFinite(age) && age > STALE_MS) {
    return { stale: true, reason: '距上次备份已超过 2 天', lastAt, changes };
  }
  if (changes >= STALE_CHANGES) {
    return { stale: true, reason: `已有 ${changes} 处改动尚未备份`, lastAt, changes };
  }
  return { stale: false, reason: null, lastAt, changes };
}

/** Trigger download / iOS share sheet for an already-encrypted envelope. */
export async function shareEncryptedBackupFile(file: EncryptedBackupFile): Promise<'share' | 'download'> {
  if (!isEncryptedBackupFile(file)) throw new Error('只能分享加密备份。');
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
      await recordMobileBackupSuccess();
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
  await recordMobileBackupSuccess();
  return 'download';
}

