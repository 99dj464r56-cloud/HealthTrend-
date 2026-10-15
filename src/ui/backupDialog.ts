import { MIN_PASSWORD_LENGTH } from '../security/vault';

/** Passwords exist only in this short-lived form; never stored in browser settings. */
export function showBackupDialog<T>(options: {
  kind: 'export' | 'restore';
  run: (password: string) => Promise<T>;
}): Promise<T | null> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'backup-dialog';
    const form = document.createElement('form');
    const heading = document.createElement('h2');
    heading.id = 'backup-dialog-title';
    heading.textContent = options.kind === 'export' ? '导出加密备份' : '恢复加密备份';
    dialog.setAttribute('aria-labelledby', heading.id);
    const note = document.createElement('p');
    note.textContent = options.kind === 'export'
      ? '此密码仅用于备份文件，不影响日常打开档案。请妥善保存密码；忘记后无法恢复文件。下载后请自行保存到「文件」或 iCloud 云盘。'
      : '输入导出这份文件时设置的备份密码。解密后会先显示预览，确认后才替换本机档案。';
    const passwordLabel = document.createElement('label');
    passwordLabel.className = 'form-field';
    passwordLabel.textContent = '备份密码';
    const password = document.createElement('input');
    password.type = 'password';
    password.required = true;
    password.autocomplete = options.kind === 'export' ? 'new-password' : 'off';
    if (options.kind === 'export') password.minLength = MIN_PASSWORD_LENGTH;
    passwordLabel.append(password);
    const confirmationLabel = document.createElement('label');
    confirmationLabel.className = 'form-field';
    confirmationLabel.textContent = '再次输入密码';
    const confirmation = document.createElement('input');
    confirmation.type = 'password';
    confirmation.required = true;
    confirmation.autocomplete = 'new-password';
    confirmationLabel.append(confirmation);
    const error = document.createElement('p');
    error.className = 'form-error';
    error.setAttribute('role', 'alert');
    const actions = document.createElement('div');
    actions.className = 'form-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'secondary-button';
    cancel.textContent = '取消';
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'primary-button';
    submit.textContent = options.kind === 'export' ? '加密并下载' : '解密并预览';
    let busy = false;
    function finish(value: T | null): void {
      password.value = '';
      confirmation.value = '';
      dialog.close();
      dialog.remove();
      resolve(value);
    }
    cancel.addEventListener('click', () => { if (!busy) finish(null); });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      if (!busy) finish(null);
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (busy) return;
      error.textContent = '';
      if (options.kind === 'export' && password.value !== confirmation.value) {
        error.textContent = '两次密码不一致，请重新输入。';
        confirmation.focus();
        return;
      }
      busy = true;
      submit.disabled = cancel.disabled = password.disabled = confirmation.disabled = true;
      form.setAttribute('aria-busy', 'true');
      try { finish(await options.run(password.value)); }
      catch (cause) {
        error.textContent = cause instanceof Error ? cause.message : '备份操作失败，请重试。';
      } finally {
        busy = false;
        submit.disabled = cancel.disabled = password.disabled = confirmation.disabled = false;
        form.removeAttribute('aria-busy');
      }
    });
    actions.append(cancel, submit);
    form.append(heading, note, passwordLabel);
    if (options.kind === 'export') {
      const hint = document.createElement('p');
      hint.className = 'form-help';
      hint.textContent = `密码至少 ${MIN_PASSWORD_LENGTH} 个字符，建议使用较长且独立的密码。`;
      form.append(confirmationLabel, hint);
    }
    form.append(error, actions);
    dialog.append(form);
    document.body.append(dialog);
    dialog.showModal();
    password.focus();
  });
}
