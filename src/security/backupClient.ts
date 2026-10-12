/**
 * Encrypted backup transport. Only ever handles EncryptedBackupFile envelopes.
 * 1) Localhost Vite middleware (/__backup/*) when the launcher set HEALTH_BACKUP_DIR (iCloud folder).
 * 2) Fallback: File System Access API directory handle chosen by the user (persisted in IndexedDB).
 */
import { getSetting, putSetting } from '../storage/indexedDb';
import { isEncryptedBackupFile, type EncryptedBackupFile } from './vault';
import { nativeBridge } from '../native/bridge';

export const BACKUP_FILE_NAME = 'health-trend-personal.enc.json';
const HISTORY_DIR = '备份历史';
const HISTORY_KEEP = 10;
const HEADERS = { 'X-Health-Backup': '1' };
const HANDLE_SETTING = 'backup-dir-handle';

export type BackupTarget = 'server' | 'folder' | 'native' | 'none';

export interface BackupResult {
  target: BackupTarget;
  savedAt: Date;
  /** Human label for the destination (desktop app). */
  label?: string;
}

export class BackupUnavailableError extends Error {
  constructor() {
    super('未设置备份位置：点「选择备份文件夹」（建议 iCloud 云盘）。');
    this.name = 'BackupUnavailableError';
  }
}

let serverEnabledCache: boolean | null = null;

export async function isServerBackupEnabled(): Promise<boolean> {
  if (nativeBridge()) return false;
  if (serverEnabledCache !== null) return serverEnabledCache;
  try {
    const response = await fetch(`${apiBase()}__backup/status`, { headers: HEADERS, cache: 'no-store' });
    const body = response.ok ? await response.json() as { enabled?: boolean } : null;
    serverEnabledCache = Boolean(body?.enabled);
  } catch {
    serverEnabledCache = false;
  }
  return serverEnabledCache;
}

function apiBase(): string {
  const base = import.meta.env.BASE_URL || '/';
  return base.endsWith('/') ? base : `${base}/`;
}

// ---- File System Access fallback (Chromium/Edge) ----
type PermissionMode = { mode: 'readwrite' };
interface DirHandle {
  name: string;
  queryPermission?(options: PermissionMode): Promise<PermissionState>;
  requestPermission?(options: PermissionMode): Promise<PermissionState>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{ createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>; getFile(): Promise<File> }>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirHandle>;
  removeEntry(name: string): Promise<void>;
  keys?(): AsyncIterable<string>;
}

export function folderPickerSupported(): boolean {
  if (nativeBridge()) return true;
  return typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
}

export async function chooseBackupFolder(): Promise<string> {
  const native = nativeBridge();
  if (native) {
    const label = await native.chooseBackupDir();
    if (!label) throw new Error('cancelled');
    return label;
  }
  const picker = (window as unknown as { showDirectoryPicker: (o: object) => Promise<DirHandle> }).showDirectoryPicker;
  const handle = await picker({ id: 'health-trend-backup', mode: 'readwrite' });
  await putSetting(HANDLE_SETTING, handle);
  return handle.name;
}

export async function getBackupFolderName(): Promise<string | null> {
  const native = nativeBridge();
  if (native) {
    const status = await native.backupStatus().catch(() => null);
    return status?.enabled ? (status.icloud ? `iCloud · ${status.label}` : status.label ?? null) : null;
  }
  const handle = await getSetting<DirHandle>(HANDLE_SETTING).catch(() => undefined);
  return handle?.name ?? null;
}

async function ensureFolderPermission(handle: DirHandle, interactive: boolean): Promise<boolean> {
  if (!handle.queryPermission) return true;
  if (await handle.queryPermission({ mode: 'readwrite' }) === 'granted') return true;
  if (!interactive || !handle.requestPermission) return false;
  return await handle.requestPermission({ mode: 'readwrite' }) === 'granted';
}

async function writeToFolder(handle: DirHandle, text: string): Promise<void> {
  const file = await handle.getFileHandle(BACKUP_FILE_NAME, { create: true });
  const writable = await file.createWritable();
  await writable.write(text);
  await writable.close();
  // Dated history copies (at most one per hour, keep newest 10).
  const history = await handle.getDirectoryHandle(HISTORY_DIR, { create: true });
  const names: string[] = [];
  if (history.keys) for await (const name of history.keys()) if (/^health-trend-personal\.enc\.\d{8}-\d{2}\.json$/.test(name)) names.push(name);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const hourName = `health-trend-personal.enc.${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}.json`;
  if (!names.includes(hourName)) {
    const copy = await history.getFileHandle(hourName, { create: true });
    const copyWritable = await copy.createWritable();
    await copyWritable.write(text);
    await copyWritable.close();
    names.push(hourName);
  }
  names.sort();
  for (const old of names.slice(0, Math.max(0, names.length - HISTORY_KEEP))) await history.removeEntry(old).catch(() => undefined);
}

/** Save an already-encrypted envelope. `interactive` allows a permission prompt (user gesture). */
export async function saveEncryptedBackup(file: EncryptedBackupFile, interactive = false): Promise<BackupResult> {
  if (!isEncryptedBackupFile(file)) throw new Error('拒绝写入：备份必须是加密格式。');
  const text = `${JSON.stringify(file)}\n`;
  const native = nativeBridge();
  if (native) {
    const status = await native.backupStatus();
    if (!status.enabled) throw new BackupUnavailableError();
    const result = await native.writeBackup(text);
    return { target: 'native', savedAt: new Date(result.savedAt), label: status.icloud ? 'iCloud' : `「${status.label}」` };
  }
  if (await isServerBackupEnabled()) {
    const response = await fetch(`${apiBase()}__backup/personal`, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: text,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(`iCloud 备份失败：${body.error ?? response.status}`);
    }
    return { target: 'server', savedAt: new Date() };
  }
  const handle = await getSetting<DirHandle>(HANDLE_SETTING).catch(() => undefined);
  if (handle) {
    if (!await ensureFolderPermission(handle, interactive)) throw new Error('备份文件夹需要重新授权：点「立即备份」并允许访问。');
    await writeToFolder(handle, text);
    return { target: 'folder', savedAt: new Date() };
  }
  throw new BackupUnavailableError();
}

/** Fetch the current iCloud backup via the localhost middleware (null if none/disabled). */
export async function fetchServerBackup(): Promise<EncryptedBackupFile | null> {
  const native = nativeBridge();
  if (native) {
    const text = await native.readBackup().catch(() => null);
    if (!text) return null;
    try {
      const parsed: unknown = JSON.parse(text);
      return isEncryptedBackupFile(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  if (!await isServerBackupEnabled()) return null;
  const response = await fetch(`${apiBase()}__backup/personal`, { headers: HEADERS, cache: 'no-store' });
  if (!response.ok) return null;
  const body: unknown = await response.json();
  return isEncryptedBackupFile(body) ? body : null;
}

export async function readBackupFile(file: File): Promise<EncryptedBackupFile> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('无法读取该文件：不是有效的 JSON。');
  }
  if (!isEncryptedBackupFile(parsed)) throw new Error('该文件不是加密备份（health-trend-personal.enc.json）。');
  return parsed;
}

export function resetBackupCacheForTests(): void {
  serverEnabledCache = null;
}
