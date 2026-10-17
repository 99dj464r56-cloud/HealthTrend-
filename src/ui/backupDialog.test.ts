// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { showSyncPasswordDialog, SYNC_KEYCHAIN_USERNAME } from './backupDialog';

describe('sync password dialog', () => {
  afterEach(() => { document.body.replaceChildren(); });

  it('exposes a stable keychain username and current-password field for autofill', async () => {
    const pending = showSyncPasswordDialog({
      title: 't', note: 'n', submitLabel: 's', newPassword: false, allowNewPassword: true,
      run: async (password) => password,
    });
    const username = document.querySelector<HTMLInputElement>('#sync-username')!;
    const password = document.querySelector<HTMLInputElement>('#sync-password')!;
    expect(username.autocomplete).toBe('username');
    expect(username.value).toBe(SYNC_KEYCHAIN_USERNAME);
    expect(password.type).toBe('password');
    expect(password.autocomplete).toBe('current-password');
    password.value = 'example-pass';
    document.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await expect(pending).resolves.toBe('example-pass');
  });

  it('asks twice with new-password on first sync and rejects mismatches', async () => {
    let ran = false;
    void showSyncPasswordDialog({ title: 't', note: 'n', submitLabel: 's', newPassword: true, run: async () => { ran = true; } });
    const password = document.querySelector<HTMLInputElement>('#sync-password')!;
    expect(password.autocomplete).toBe('new-password');
    password.value = 'example-pass';
    document.querySelector<HTMLInputElement>('input[name="password-confirm"]')!.value = 'different-pass';
    document.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();
    expect(ran).toBe(false);
    expect(document.querySelector('.form-error')?.textContent).toContain('不一致');
  });
});
