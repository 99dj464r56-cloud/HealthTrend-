/**
 * Personal-mode gate: first-time password setup (with migration), unlock, and restore
 * from an encrypted iCloud backup. The password lives only in the input element and the
 * local variables of the submit handler; it is never logged, stored or sent anywhere.
 */
import type { HealthRecord } from '../domain/types';
import { emptyHealthRecord } from '../domain/types';
import { migrateHealthRecord } from '../domain/migrate';
import { validateHealthRecord } from '../domain/validation';
import {
  getVaultMeta,
  initializeVault,
  loadHealthRecord,
  putVaultMeta,
  loadPlaintextRecordForMigration,
  setSessionKey,
} from '../storage/indexedDb';
import {
  MIN_PASSWORD_LENGTH,
  WrongPasswordError,
  assertPasswordStrength,
  createVault,
  openBackupFile,
  unlockVault,
  type EncryptedBackupFile,
  type VaultMeta,
} from '../security/vault';
import { fetchServerBackup, readBackupFile } from '../security/backupClient';
import { enrollTouchId, touchIdSupport, unlockWithTouchId } from '../security/touchId';
import { fetchPersonalSeedRecord } from '../workspace/personalSeed';

export interface PersonalSession {
  record: HealthRecord;
  meta: VaultMeta;
  key: CryptoKey;
  /** True when the session was just created/restored (caller should back up immediately). */
  fresh: boolean;
}

export const FORGOT_PASSWORD_WARNING = '忘记密码将无法恢复加密备份';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function passwordField(id: string, label: string, autocomplete: string): { wrap: HTMLLabelElement; input: HTMLInputElement } {
  const wrap = el('label', 'form-field');
  const caption = el('span', undefined, label);
  const input = el('input');
  input.id = id;
  input.name = id;
  input.type = 'password';
  input.autocomplete = autocomplete as AutoFill;
  input.required = true;
  input.minLength = MIN_PASSWORD_LENGTH;
  input.spellcheck = false;
  wrap.append(caption, input);
  return { wrap, input };
}

function shell(titleText: string, subtitle: string): { page: HTMLElement; card: HTMLElement } {
  const page = el('main', 'page-shell lock-shell');
  const card = el('section', 'lock-card');
  card.setAttribute('data-lock-card', '');
  const badge = el('span', 'lock-badge', '个人 · 已加密');
  const title = el('h2', undefined, titleText);
  const sub = el('p', 'muted', subtitle);
  card.append(badge, title, sub);
  page.append(card);
  return { page, card };
}

function countSummary(record: HealthRecord): string {
  return `${record.medications.length} 项药物、${record.indicators.length} 项指标、${record.observations.length} 条检验值`;
}

function isEmptyRecord(record: HealthRecord): boolean {
  return !record.medications.length && !record.indicators.length && !record.observations.length
    && !record.reportTextBlocks.length && !record.appleHealthRecords.length;
}

export async function runPersonalGate(root: HTMLElement, options: { onSwitchMode: () => void }): Promise<PersonalSession> {
  return new Promise<PersonalSession>((resolve) => {
    const done = (session: PersonalSession) => resolve(session);

    /** After setup/restore: offer Touch ID, then finish. rawKey is zeroed in all paths. */
    async function offerTouchId(session: PersonalSession, rawKey: Uint8Array<ArrayBuffer>): Promise<void> {
      const support = await touchIdSupport();
      if (!support.ok) {
        rawKey.fill(0);
        done(session);
        return;
      }
      const { page, card } = shell('启用 Touch ID 解锁', '推荐：以后日常用 Touch ID 解锁本机档案，不必再输入恢复密码。换电脑／恢复 iCloud 备份时仍需恢复密码。');
      card.setAttribute('data-touchid-offer', '');
      const error = el('p', 'form-error');
      error.setAttribute('role', 'alert');
      error.hidden = true;
      const actions = el('div', 'form-actions');
      const enable = el('button', 'primary-button', '用 Touch ID 解锁（推荐）');
      enable.type = 'button';
      enable.setAttribute('data-enable-touchid', '');
      const skip = el('button', 'text-button', '暂不启用（每次输入恢复密码）');
      skip.type = 'button';
      skip.addEventListener('click', () => {
        rawKey.fill(0);
        done(session);
      });
      enable.addEventListener('click', async () => {
        enable.disabled = true;
        error.hidden = true;
        try {
          const touchId = await enrollTouchId(rawKey);
          const meta = { ...session.meta, touchId };
          await putVaultMeta(meta);
          rawKey.fill(0);
          done({ ...session, meta });
        } catch (err) {
          error.textContent = err instanceof Error && err.name !== 'NotAllowedError' ? err.message : '未完成 Touch ID 验证，可稍后再试或直接使用密码。';
          error.hidden = false;
          enable.disabled = false;
        }
      });
      actions.append(enable, skip);
      card.append(actions, error);
      root.replaceChildren(page);
    }

    function restoreSection(afterCancel: () => void): HTMLElement {
      const section = el('div', 'lock-restore');
      const heading = el('h3', undefined, '从 iCloud 恢复');
      const note = el('p', 'form-help', '选择 health-trend-personal.enc.json，输入当时设置的密码。恢复会替换本机个人档案。');
      const actions = el('div', 'form-actions');
      const fromICloud = el('button', 'secondary-button', '从 iCloud 恢复');
      fromICloud.type = 'button';
      fromICloud.setAttribute('data-restore-icloud', '');
      const fileLabel = el('label', 'secondary-button file-button', '选择加密备份文件…');
      const fileInput = el('input');
      fileInput.type = 'file';
      fileInput.id = 'encrypted-backup-file';
      fileInput.accept = 'application/json,.json';
      fileLabel.append(fileInput);
      const error = el('p', 'form-error');
      error.setAttribute('role', 'alert');
      error.hidden = true;
      const fail = (message: string) => { error.textContent = message; error.hidden = false; };

      fromICloud.addEventListener('click', async () => {
        error.hidden = true;
        const file = await fetchServerBackup().catch(() => null);
        if (!file) {
          fail('未找到 iCloud 备份（需从桌面启动器打开），请改用「选择加密备份文件…」。');
          return;
        }
        renderRestorePassword(file, '来自 iCloud 备份文件夹', afterCancel);
      });
      fileInput.addEventListener('change', async () => {
        const chosen = fileInput.files?.[0];
        fileInput.value = '';
        if (!chosen) return;
        try {
          renderRestorePassword(await readBackupFile(chosen), chosen.name, afterCancel);
        } catch (err) {
          fail(err instanceof Error ? err.message : '无法读取备份文件。');
        }
      });
      actions.append(fromICloud, fileLabel);
      section.append(heading, note, actions, error);
      return section;
    }

    function switchLink(): HTMLButtonElement {
      const button = el('button', 'text-button', '切换模式');
      button.type = 'button';
      button.addEventListener('click', options.onSwitchMode);
      return button;
    }

    function renderRestorePassword(file: EncryptedBackupFile, sourceLabel: string, back: () => void, backLabel = '返回'): void {
      const { page, card } = shell('恢复加密备份', `${sourceLabel} · 备份时间 ${new Date(file.createdAt).toLocaleString('zh-CN')}`);
      const form = el('form', 'edit-form');
      form.id = 'restore-form';
      const { wrap, input } = passwordField('restore-password', '备份密码', 'current-password');
      const error = el('p', 'form-error');
      error.setAttribute('role', 'alert');
      error.hidden = true;
      const actions = el('div', 'form-actions');
      const submit = el('button', 'primary-button', '解密并恢复');
      submit.type = 'submit';
      const cancel = el('button', 'text-button', backLabel);
      cancel.type = 'button';
      cancel.addEventListener('click', back);
      actions.append(submit, cancel);
      form.append(wrap, error, actions);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        submit.disabled = true;
        error.hidden = true;
        try {
          const opened = await openBackupFile(file, input.value);
          input.value = '';
          const record = validateHealthRecord(migrateHealthRecord(opened.record));
          await initializeVault(opened.meta, opened.key, record);
          await offerTouchId({ record, meta: opened.meta, key: opened.key, fresh: true }, opened.rawKey);
        } catch (err) {
          error.textContent = err instanceof WrongPasswordError ? '密码不正确，或文件已损坏。' : (err instanceof Error ? err.message : '恢复失败。');
          error.hidden = false;
          submit.disabled = false;
          input.select();
        }
      });
      card.append(form);
      root.replaceChildren(page);
      input.focus();
    }

    let autoRestoreOffered = false;
    async function renderSetup(): Promise<void> {
      // First launch on a new browser / the desktop app: if an encrypted iCloud backup exists,
      // offer to restore it first (password only) instead of creating an empty vault.
      if (!autoRestoreOffered) {
        autoRestoreOffered = true;
        const existing = await fetchServerBackup().catch(() => null);
        if (existing) {
          renderRestorePassword(existing, '检测到 iCloud 加密备份', () => {
            // A new empty archive would be auto-backed up over the existing encrypted backup.
            if (!window.confirm('不恢复而新建空白档案？之后的自动备份会覆盖 iCloud 中现有的加密备份（较早版本保留在「备份历史」）。')) return;
            void renderSetup();
          }, '不恢复，新建档案');
          return;
        }
      }
      const migrating = await loadPlaintextRecordForMigration().catch(() => null);
      const source = migrating && !isEmptyRecord(migrating) ? migrating : await fetchPersonalSeedRecord();
      const initial = source ?? migrating ?? emptyHealthRecord();
      const sourceText = migrating && !isEmptyRecord(migrating)
        ? `将加密本机现有个人档案（${countSummary(migrating)}），原明文记录会从浏览器数据库中移除。`
        : source
          ? `将导入并加密本机种子档案（${countSummary(source)}）。`
          : '将创建空白的加密个人档案。';

      const { page, card } = shell('设置恢复密码', '首次使用：设置恢复密码（请存入钥匙串／密码管理器）。日常用 Touch ID 解锁；换电脑恢复 iCloud 备份时才需要输入密码。');
      card.setAttribute('data-setup-password', '');
      const warning = el('p', 'lock-warning', `⚠️ ${FORGOT_PASSWORD_WARNING}。这是恢复密码，不是日常登录：请立刻存入「密码」App／1Password，平时用 Touch ID。`);
      warning.setAttribute('role', 'note');
      warning.setAttribute('data-forgot-warning', '');
      const migrationNote = el('p', 'form-help', sourceText);
      migrationNote.setAttribute('data-migration-summary', '');
      const form = el('form', 'edit-form');
      form.id = 'setup-password-form';
      const first = passwordField('new-password', `恢复密码（至少 ${MIN_PASSWORD_LENGTH} 位）`, 'new-password');
      const second = passwordField('confirm-password', '再次输入恢复密码', 'new-password');
      const error = el('p', 'form-error');
      error.setAttribute('role', 'alert');
      error.hidden = true;
      const actions = el('div', 'form-actions');
      const submit = el('button', 'primary-button', '设置恢复密码并加密');
      submit.type = 'submit';
      actions.append(submit, switchLink());
      form.append(first.wrap, second.wrap, error, actions);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        error.hidden = true;
        try {
          if (first.input.value !== second.input.value) throw new Error('两次输入的密码不一致。');
          assertPasswordStrength(first.input.value);
          submit.disabled = true;
          submit.textContent = '正在加密…';
          const { meta, key, rawKey } = await createVault(first.input.value);
          first.input.value = '';
          second.input.value = '';
          await initializeVault(meta, key, initial);
          await offerTouchId({ record: initial, meta, key, fresh: true }, rawKey);
        } catch (err) {
          error.textContent = err instanceof Error ? err.message : '无法设置密码。';
          error.hidden = false;
          submit.disabled = false;
          submit.textContent = '设置恢复密码并加密';
        }
      });
      card.append(warning, migrationNote, form, restoreSection(() => void renderSetup()));
      root.replaceChildren(page);
      first.input.focus();
    }

    async function renderUnlock(meta: VaultMeta, reason?: string): Promise<void> {
      const support = await touchIdSupport();
      const { page, card } = shell('个人档案已锁定', reason ?? '密钥只保存在内存中，锁定或关闭页面后即清除。');
      card.setAttribute('data-unlock', '');
      const error = el('p', 'form-error');
      error.setAttribute('role', 'alert');
      error.hidden = true;
      const showError = (message: string) => { error.textContent = message; error.hidden = false; };

      if (meta.touchId) {
        const touchRow = el('div', 'touchid-row');
        const touchButton = el('button', 'primary-button touchid-button', '使用 Touch ID 解锁');
        touchButton.type = 'button';
        touchButton.setAttribute('data-touchid-unlock', '');
        if (!support.ok) {
          touchButton.disabled = true;
          touchRow.append(touchButton, el('p', 'form-help', support.reason ?? ''));
        } else {
          touchRow.append(touchButton);
        }
        touchButton.addEventListener('click', async () => {
          touchButton.disabled = true;
          error.hidden = true;
          try {
            const key = await unlockWithTouchId(meta);
            setSessionKey(key);
            const record = await loadHealthRecord() ?? emptyHealthRecord();
            done({ record, meta, key, fresh: false });
          } catch (err) {
            setSessionKey(null);
            showError(err instanceof Error && err.name !== 'NotAllowedError' ? err.message : 'Touch ID 未通过，请重试或输入密码。');
            touchButton.disabled = false;
          }
        });
        card.append(touchRow, el('p', 'lock-divider', '或使用密码'));
      }

      const form = el('form', 'edit-form');
      form.id = 'unlock-form';
      const { wrap, input } = passwordField('unlock-password', '恢复密码', 'current-password');
      const actions = el('div', 'form-actions');
      const submit = el('button', meta.touchId ? 'secondary-button' : 'primary-button', '用恢复密码解锁');
      submit.type = 'submit';
      actions.append(submit, switchLink());
      form.append(wrap);
      let enableBox: HTMLInputElement | null = null;
      if (!meta.touchId && support.ok) {
        const label = el('label', 'checkbox-field');
        enableBox = el('input');
        enableBox.type = 'checkbox';
        enableBox.id = 'enable-touchid-after-unlock';
        label.append(enableBox, el('span', undefined, '解锁后启用 Touch ID'));
        form.append(label);
      }
      form.append(error, actions);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        submit.disabled = true;
        error.hidden = true;
        let rawKey: Uint8Array<ArrayBuffer> | null = null;
        try {
          const unlocked = await unlockVault(meta, input.value);
          input.value = '';
          rawKey = unlocked.rawKey;
          setSessionKey(unlocked.key);
          const record = await loadHealthRecord() ?? emptyHealthRecord();
          let nextMeta = meta;
          if (enableBox?.checked) {
            try {
              nextMeta = { ...meta, touchId: await enrollTouchId(rawKey) };
              await putVaultMeta(nextMeta);
            } catch {
              // Unlock still succeeds; Touch ID can be retried at next unlock.
            }
          }
          done({ record, meta: nextMeta, key: unlocked.key, fresh: false });
        } catch (err) {
          setSessionKey(null);
          showError(err instanceof WrongPasswordError ? '密码不正确。' : (err instanceof Error ? err.message : '无法解锁。'));
          submit.disabled = false;
          input.select();
        } finally {
          rawKey?.fill(0);
        }
      });
      if (!meta.touchId) card.append(error);
      const forgot = el('p', 'form-help', `${FORGOT_PASSWORD_WARNING}。`);
      card.append(form, forgot, restoreSection(() => void renderUnlock(meta, reason)));
      root.replaceChildren(page);
      if (!meta.touchId) input.focus();
    }

    void (async () => {
      const meta = await getVaultMeta();
      const reason = new URLSearchParams(window.location.search).get('locked') === 'idle'
        ? '闲置 15 分钟已自动锁定。输入密码继续。'
        : undefined;
      if (meta) await renderUnlock(meta, reason);
      else await renderSetup();
    })();
  });
}
