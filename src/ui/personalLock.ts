/**
 * Personal-mode open: device-local access (no app password).
 * New / plaintext installs open immediately. Legacy password vaults get a one-time
 * migrate screen so existing encrypted data is not deleted.
 */
import type { HealthRecord } from "../domain/types";
import { emptyHealthRecord } from "../domain/types";
import {
  getVaultMeta,
  loadHealthRecord,
  loadPlaintextRecordForMigration,
  migrateVaultToPlaintext,
  saveHealthRecord,
  setSessionKey,
} from "../storage/indexedDb";
import {
  MIN_PASSWORD_LENGTH,
  WrongPasswordError,
  unlockVault,
  type VaultMeta,
} from "../security/vault";
import { fetchPersonalSeedRecord } from "../workspace/personalSeed";

export interface PersonalSession {
  record: HealthRecord;
  /** True when the session was just created/restored (caller may schedule a backup). */
  fresh: boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function isEmptyRecord(record: HealthRecord): boolean {
  return !record.medications.length && !record.indicators.length && !record.observations.length
    && !record.reportTextBlocks.length && !record.appleHealthRecords.length;
}

async function openPlainPersonal(): Promise<PersonalSession> {
  let record = await loadHealthRecord().catch(() => null);
  if (!record || isEmptyRecord(record)) {
    const migrating = await loadPlaintextRecordForMigration().catch(() => null);
    const seed = await fetchPersonalSeedRecord();
    const initial = (migrating && !isEmptyRecord(migrating) ? migrating : null) ?? seed ?? migrating ?? emptyHealthRecord();
    await saveHealthRecord(initial);
    return { record: initial, fresh: Boolean(seed || (migrating && !isEmptyRecord(migrating))) };
  }
  return { record, fresh: false };
}

/**
 * Open personal mode without an app password.
 * Legacy encrypted vaults: one-time password to migrate to plaintext device-local storage.
 */
export async function openPersonalSession(
  root: HTMLElement,
  options: { onSwitchMode: () => void },
): Promise<PersonalSession> {
  const meta = await getVaultMeta();
  if (!meta) return openPlainPersonal();
  return migrateLegacyVault(root, meta, options);
}

/** @deprecated Use openPersonalSession */
export async function runPersonalGate(
  root: HTMLElement,
  options: { onSwitchMode: () => void },
): Promise<PersonalSession> {
  return openPersonalSession(root, options);
}

function migrateLegacyVault(
  root: HTMLElement,
  meta: VaultMeta,
  options: { onSwitchMode: () => void },
): Promise<PersonalSession> {
  return new Promise<PersonalSession>((resolve) => {
    const page = el("main", "page-shell lock-shell");
    const card = el("section", "lock-card");
    card.setAttribute("data-lock-card", "");
    card.setAttribute("data-legacy-migrate", "");
    card.append(
      el("span", "lock-badge", "个人 · 迁移"),
      el("h2", undefined, "迁移到本机直开"),
      el("p", "muted", "此设备上仍有旧版「恢复密码」加密档案。输入一次旧密码后，将改为本机直开（之后不再需要 App 密码；设备解锁即可）。健康数据不会删除。"),
    );

    const form = el("form", "edit-form");
    form.id = "legacy-migrate-form";
    const wrap = el("label", "form-field");
    wrap.append(el("span", undefined, "旧恢复密码"));
    const input = el("input");
    input.id = "legacy-migrate-password";
    input.name = "legacy-migrate-password";
    input.type = "password";
    input.autocomplete = "current-password";
    input.required = true;
    input.minLength = MIN_PASSWORD_LENGTH;
    input.spellcheck = false;
    wrap.append(input);

    const error = el("p", "form-error");
    error.setAttribute("role", "alert");
    error.hidden = true;

    const actions = el("div", "form-actions");
    const submit = el("button", "primary-button", "解锁并迁移");
    submit.type = "submit";
    const switchMode = el("button", "text-button", "切换模式");
    switchMode.type = "button";
    switchMode.addEventListener("click", options.onSwitchMode);
    actions.append(submit, switchMode);

    form.append(wrap, error, actions);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      submit.disabled = true;
      error.hidden = true;
      let rawKey: Uint8Array<ArrayBuffer> | null = null;
      try {
        const unlocked = await unlockVault(meta, input.value);
        input.value = "";
        rawKey = unlocked.rawKey;
        setSessionKey(unlocked.key);
        const record = await loadHealthRecord() ?? emptyHealthRecord();
        await migrateVaultToPlaintext(record);
        rawKey.fill(0);
        resolve({ record, fresh: true });
      } catch (err) {
        setSessionKey(null);
        error.textContent = err instanceof WrongPasswordError
          ? "密码不正确。"
          : (err instanceof Error ? err.message : "无法迁移。");
        error.hidden = false;
        submit.disabled = false;
        input.select();
      } finally {
        rawKey?.fill(0);
      }
    });

    card.append(form);
    page.append(card);
    root.replaceChildren(page);
    input.focus();
  });
}
