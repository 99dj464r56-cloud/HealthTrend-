/**
 * Personal-mode iCloud sync UI: one tap to pull the shared encrypted file, one tap to push it.
 * Mac app reads/writes the chosen iCloud folder directly; iPhone Safari uses the file picker
 * and the share sheet (存储到“文件” → iCloud 云盘).
 */
import type { HealthRecord } from '../domain/types';
import { exportEncryptedBackup, restoreEncryptedBackup } from '../import/encryptedBackup';
import { nativeBridge } from '../native/bridge';
import { BACKUP_FILE_NAME, saveEncryptedBackup } from '../security/backupClient';
import {
  compareSyncFreshness,
  describeFreshness,
  dismissLaunchPrompt,
  formatSyncTime,
  getLastSyncedCreatedAt,
  getSyncState,
  launchPromptDismissedFor,
  markSynced,
  parseEnvelopeText,
  syncPasswordUsedBefore,
} from '../security/icloudSync';
import { shareEncryptedBackupFile } from '../security/mobileBackup';
import { isSparseRecord } from '../security/pendingRestore';
import type { EncryptedBackupFile } from '../security/vault';
import { showSyncPasswordDialog } from './backupDialog';

export interface ICloudSyncContext {
  getRecord(): HealthRecord | null;
  /** Replace the local record with a decrypted backup (caller commits + re-renders). */
  applyIncoming(incoming: HealthRecord): Promise<void>;
  onError(message: string): void;
  onStatus(message: string): void;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : '同步失败，请重试。';
}

/** Decrypt an envelope and replace local data, confirming first unless the file is newer. */
export async function restoreFromEnvelopeText(
  text: string,
  fileName: string,
  ctx: ICloudSyncContext,
  options: { confirmed?: boolean } = {},
): Promise<boolean> {
  const envelope = parseEnvelopeText(text);
  if (!envelope) throw new Error(`「${fileName}」不是 HealthTrend 加密备份（${BACKUP_FILE_NAME}）。`);
  const local = ctx.getRecord();
  const freshness = compareSyncFreshness({
    fileCreatedAt: envelope.createdAt,
    localUpdatedAt: local?.updatedAt,
    ...await getSyncState(),
  });
  const description = describeFreshness(freshness, envelope.createdAt, local?.updatedAt);
  if (!options.confirmed && freshness !== 'file-newer' && !isSparseRecord(local)) {
    if (!window.confirm(`${description}\n\n仍要用这份 iCloud 文件覆盖本机资料？取消则不做任何更改。`)) return false;
  }
  const file = new File([text], fileName, { type: 'application/json' });
  const restored = await showSyncPasswordDialog({
    title: '从 iCloud 同步 / Sync from iCloud',
    note: `${description} 输入备份密码（可用钥匙串自动填充），解密成功后替换本机资料。`,
    submitLabel: '解密并同步',
    newPassword: false,
    run: (password) => restoreEncryptedBackup(file, password),
  });
  if (!restored) return false;
  await ctx.applyIncoming(restored);
  await markSynced(envelope.createdAt, ctx.getRecord()?.updatedAt);
  ctx.onStatus(`已从 iCloud 同步（文件导出于 ${formatSyncTime(envelope.createdAt)}）。`);
  return true;
}

function showShareRetry(backup: EncryptedBackupFile, ctx: ICloudSyncContext): void {
  const dialog = document.createElement('dialog');
  dialog.className = 'backup-dialog';
  const form = document.createElement('form');
  const heading = document.createElement('h2');
  heading.textContent = '备份已加密';
  const note = document.createElement('p');
  note.textContent = '点下方按钮打开分享面板，选「存储到“文件”」→ iCloud 云盘 →「日常调阅」。';
  const actions = document.createElement('div');
  actions.className = 'form-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'secondary-button';
  cancel.textContent = '取消';
  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'primary-button';
  go.textContent = '保存到「文件」';
  const close = () => { dialog.close(); dialog.remove(); };
  cancel.addEventListener('click', close);
  go.addEventListener('click', async () => {
    try {
      await shareEncryptedBackupFile(backup);
      await markSynced(backup.createdAt, ctx.getRecord()?.updatedAt);
      close();
      ctx.onStatus('已生成 iCloud 同步文件。');
    } catch (error) {
      if ((error as { name?: string }).name === 'AbortError') return;
      close();
      ctx.onError(errorText(error));
    }
  });
  actions.append(cancel, go);
  form.append(heading, note, actions);
  dialog.append(form);
  document.body.append(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

async function saveToICloud(ctx: ICloudSyncContext): Promise<void> {
  const local = ctx.getRecord();
  if (!local) return;
  const native = nativeBridge();
  if (native) {
    const status = await native.backupStatus();
    if (!status.enabled && !await native.chooseBackupDir()) return;
  }
  const usedBefore = await syncPasswordUsedBefore();
  const backup = await showSyncPasswordDialog({
    title: '同步到 iCloud / Save to iCloud',
    note: native
      ? `加密后写入已选的 iCloud 文件夹（${BACKUP_FILE_NAME}，旧版本自动留在「备份历史」）。`
      : `加密后打开分享面板：选「存储到“文件”」→ iCloud 云盘 →「日常调阅」，文件名保持 ${BACKUP_FILE_NAME}；提示同名文件时选「替换」。`,
    submitLabel: native ? '加密并保存' : '加密并分享',
    newPassword: !usedBefore,
    allowNewPassword: true,
    run: (password) => exportEncryptedBackup(local, password),
  });
  if (!backup) return;
  if (native) {
    const result = await saveEncryptedBackup(backup, true);
    await markSynced(backup.createdAt, local.updatedAt);
    ctx.onStatus(`已同步到 ${result.label ?? 'iCloud'}（${formatSyncTime(result.savedAt.toISOString())}）。`);
    return;
  }
  try {
    const how = await shareEncryptedBackupFile(backup, { rethrowNotAllowed: true });
    await markSynced(backup.createdAt, local.updatedAt);
    ctx.onStatus(how === 'share' ? '已生成 iCloud 同步文件。' : `已下载 ${BACKUP_FILE_NAME}，请移到 iCloud 云盘「日常调阅」。`);
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name === 'AbortError') return;
    if (name === 'NotAllowedError') { showShareRetry(backup, ctx); return; }
    throw error;
  }
}

async function syncFromICloud(ctx: ICloudSyncContext, picker: HTMLInputElement): Promise<void> {
  const native = nativeBridge();
  if (!native) {
    picker.click();
    return;
  }
  let status = await native.backupStatus();
  if (!status.enabled) {
    if (!await native.chooseBackupDir()) return;
    status = await native.backupStatus();
  }
  const text = await native.readBackup();
  if (!text) throw new Error(`iCloud 文件夹「${status.label ?? ''}」中没有 ${BACKUP_FILE_NAME}。请先在另一台设备点「同步到 iCloud」。`);
  await restoreFromEnvelopeText(text, BACKUP_FILE_NAME, ctx);
}

export function createICloudSyncPanel(ctx: ICloudSyncContext): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'icloud-sync-panel';
  panel.dataset.icloudSync = 'true';
  const heading = document.createElement('h3');
  heading.textContent = 'iCloud 同步（Mac ⇄ iPhone）';
  const actions = document.createElement('div');
  actions.className = 'icloud-sync-actions';
  const pull = document.createElement('button');
  pull.type = 'button';
  pull.className = 'primary-button';
  pull.id = 'icloud-sync-pull';
  pull.textContent = '从 iCloud 同步 / Sync from iCloud';
  const push = document.createElement('button');
  push.type = 'button';
  push.className = 'primary-button';
  push.id = 'icloud-sync-push';
  push.textContent = '同步到 iCloud / Save to iCloud';
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = 'application/json,.json';
  picker.id = 'icloud-sync-file';
  picker.hidden = true;
  const status = document.createElement('p');
  status.className = 'icloud-sync-status';
  status.setAttribute('role', 'status');

  const local = ctx.getRecord();
  void getLastSyncedCreatedAt().then((last) => {
    status.textContent = `本机最后修改：${formatSyncTime(local?.updatedAt)} · 本机上次同步的文件：${last ? formatSyncTime(last) : '尚未同步'}`;
  });

  pull.addEventListener('click', () => {
    void syncFromICloud(ctx, picker).catch((error) => ctx.onError(errorText(error)));
  });
  push.addEventListener('click', () => {
    void saveToICloud(ctx).catch((error) => ctx.onError(errorText(error)));
  });
  picker.addEventListener('change', () => {
    const file = picker.files?.[0];
    picker.value = '';
    if (!file) return;
    void (async () => {
      if (file.size > 25 * 1024 * 1024) throw new Error('备份文件过大（最大 25 MiB）。');
      await restoreFromEnvelopeText(await file.text(), file.name, ctx);
    })().catch((error) => ctx.onError(errorText(error)));
  });

  actions.append(pull, push);
  panel.append(heading, actions, picker, status);
  return panel;
}

/**
 * Mac app launch: if the iCloud file is newer than this Mac's data (e.g. edited on iPhone),
 * offer to restore it. A declined file is not offered again.
 */
export async function checkNativeICloudOnLaunch(ctx: ICloudSyncContext): Promise<void> {
  const native = nativeBridge();
  if (!native) return;
  const status = await native.backupStatus().catch(() => null);
  if (!status?.enabled || !status.exists) return;
  const text = await native.readBackup().catch(() => null);
  const envelope = parseEnvelopeText(text);
  if (!text || !envelope) return;
  const local = ctx.getRecord();
  const freshness = compareSyncFreshness({
    fileCreatedAt: envelope.createdAt,
    localUpdatedAt: local?.updatedAt,
    ...await getSyncState(),
  });
  if (freshness !== 'file-newer' && freshness !== 'conflict' && freshness !== 'local-unknown') return;
  if (await launchPromptDismissedFor(envelope.createdAt)) return;
  const description = describeFreshness(freshness, envelope.createdAt, local?.updatedAt);
  if (!window.confirm(`${description}\n\n要现在从 iCloud 恢复（例如 iPhone 上的修改）吗？取消则保留本机资料，这份文件不再提示。`)) {
    await dismissLaunchPrompt(envelope.createdAt);
    return;
  }
  await restoreFromEnvelopeText(text, BACKUP_FILE_NAME, ctx, { confirmed: true });
}
