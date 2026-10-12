/**
 * HealthTrend desktop shell (Electron).
 * - Serves the built web app from inside the bundle via app://healthtrend/ (secure, offline; OCR assets bundled).
 * - Encrypted backup: main process writes ONLY encrypted envelopes to a fixed filename in the
 *   user-chosen backup folder (settings.json in userData; no personal path is baked into the bundle).
 * - Touch ID: systemPreferences.promptTouchID (LocalAuthentication sheet) gates enroll/unlock;
 *   DEK then lives in Keychain as WhenUnlockedThisDeviceOnly via a native helper.
 *   We do not use Electron safeStorage (triggers login-keychain password) or biometry ACL
 *   (needs Apple Developer entitlements; unsigned personal builds get errSecMissingEntitlement).
 */
const { app, BrowserWindow, dialog, ipcMain, net, protocol, shell, systemPreferences } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const SCHEME = 'app';
const HOST = 'healthtrend';
const BACKUP_FILE_NAME = 'health-trend-personal.enc.json';
const HISTORY_DIR_NAME = '备份历史';
const HISTORY_KEEP = 10;
const ROTATE_EVERY_MS = 60 * 60 * 1000;
const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_KEYS = new Set(['format', 'version', 'kdf', 'wrappedKey', 'cipher', 'createdAt']);

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const webRoot = () => path.join(__dirname, '..', 'web');
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

async function readSettings() {
  try { return JSON.parse(await fs.readFile(settingsPath(), 'utf8')); } catch { return {}; }
}
async function writeSettings(next) {
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await fs.writeFile(settingsPath(), JSON.stringify(next, null, 2), { mode: 0o600 });
}

const KC_SERVICE = 'local.healthtrend.app.touchid';
const KC_ACCOUNT = 'personal-dek';

function keychainBin() {
  // Packaged: Contents/Resources/keychain-touchid ; Dev: electron/native/keychain-touchid next to main.
  const candidates = [
    path.join(process.resourcesPath || '', 'keychain-touchid'),
    path.join(__dirname, 'native', 'keychain-touchid'),
  ];
  for (const c of candidates) {
    try { require('node:fs').accessSync(c); return c; } catch { /* next */ }
  }
  throw new Error('缺少 Touch ID 助手');
}

function keychain(args) {
  const bin = keychainBin();
  const r = spawnSync(bin, args, { encoding: 'utf8' });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    const msg = (r.stderr || '').trim() || `keychain exit ${r.status}`;
    const err = new Error(msg);
    err.code = r.status;
    throw err;
  }
  return (r.stdout || '').trim();
}

async function backupDir() {
  const s = await readSettings();
  if (typeof s.backupDir !== 'string' || !s.backupDir) return null;
  const info = await fs.stat(s.backupDir).catch(() => null);
  return info && info.isDirectory() ? s.backupDir : null;
}

function isB64(v) { return typeof v === 'string' && /^[A-Za-z0-9+/=]+$/.test(v); }
function isEncryptedEnvelope(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  if (Object.keys(v).some((k) => !ALLOWED_KEYS.has(k))) return false;
  if (v.format !== 'health-trend-personal-enc' || v.version !== 2) return false;
  const k = v.kdf, c = v.cipher, w = v.wrappedKey;
  if (!k || k.name !== 'PBKDF2' || !isB64(k.salt) || typeof k.iterations !== 'number') return false;
  for (const blob of [c, w]) if (!blob || blob.alg !== 'AES-GCM' || !isB64(blob.iv) || !isB64(blob.ciphertext)) return false;
  return true;
}
function stamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
async function rotate(dir, now) {
  const hist = path.join(dir, HISTORY_DIR_NAME);
  await fs.mkdir(hist, { recursive: true });
  const names = (await fs.readdir(hist)).filter((n) => /^health-trend-personal\.enc\.\d{8}-\d{6}\.json$/.test(n)).sort();
  const newest = names.at(-1);
  if (newest) {
    const info = await fs.stat(path.join(hist, newest));
    if (now.getTime() - info.mtimeMs < ROTATE_EVERY_MS) return;
  }
  const target = `health-trend-personal.enc.${stamp(now)}.json`;
  await fs.copyFile(path.join(dir, BACKUP_FILE_NAME), path.join(hist, target));
  const all = [...names, target].sort();
  for (const old of all.slice(0, Math.max(0, all.length - HISTORY_KEEP))) await fs.unlink(path.join(hist, old)).catch(() => {});
}

function fromApp(event) {
  // Node reports origin "null" for custom schemes, so compare protocol + host explicitly.
  try {
    const u = new URL(event.senderFrame.url);
    return u.protocol === `${SCHEME}:` && u.host === HOST;
  } catch {
    return false;
  }
}
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!fromApp(event)) throw new Error('forbidden');
    return fn(event, ...args);
  });
}

function registerIpc() {
  handle('backup:status', async () => {
    const dir = await backupDir();
    if (!dir) return { enabled: false, dir: null, exists: false, modifiedAt: null };
    const info = await fs.stat(path.join(dir, BACKUP_FILE_NAME)).catch(() => null);
    return { enabled: true, dir, label: path.basename(dir), icloud: dir.includes('CloudDocs'), exists: Boolean(info), modifiedAt: info ? info.mtime.toISOString() : null };
  });
  handle('backup:choose-dir', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      title: '选择加密备份文件夹（建议 iCloud 云盘中的文件夹）',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: app.getPath('home'),
    });
    if (result.canceled || !result.filePaths[0]) return null;
    await writeSettings({ ...(await readSettings()), backupDir: result.filePaths[0] });
    return path.basename(result.filePaths[0]);
  });
  handle('backup:read', async () => {
    const dir = await backupDir();
    if (!dir) return null;
    return fs.readFile(path.join(dir, BACKUP_FILE_NAME), 'utf8').catch(() => null);
  });
  handle('backup:write', async (_event, text) => {
    if (typeof text !== 'string' || text.length > MAX_BYTES) throw new Error('invalid payload');
    let payload;
    try { payload = JSON.parse(text); } catch { throw new Error('invalid payload'); }
    if (!isEncryptedEnvelope(payload)) throw new Error('only encrypted backups are accepted');
    const dir = await backupDir();
    if (!dir) throw new Error('未设置备份文件夹');
    const finalPath = path.join(dir, BACKUP_FILE_NAME);
    const tmpPath = path.join(dir, `.${BACKUP_FILE_NAME}.tmp`);
    await fs.writeFile(tmpPath, `${JSON.stringify(payload)}\n`, { mode: 0o600 });
    await fs.rename(tmpPath, finalPath);
    const now = new Date();
    await rotate(dir, now);
    return { savedAt: now.toISOString() };
  });

  handle('touchid:available', async () => {
    try {
      if (!systemPreferences.canPromptTouchID()) return false;
      return keychain(['available']) === '1';
    } catch {
      return false;
    }
  });
  handle('touchid:enroll', async (_event, rawB64) => {
    if (!isB64(rawB64) || Buffer.from(rawB64, 'base64').length !== 32) throw new Error('invalid key');
    // Explicit Touch ID consent first (LocalAuthentication sheet — not the login-keychain password dialog).
    await systemPreferences.promptTouchID('启用 HealthTrend 的 Touch ID 解锁');
    // Persist DEK under a biometry ACL; reading it later shows Touch ID again (device-bound).
    keychain(['store', KC_SERVICE, KC_ACCOUNT, rawB64]);
    return true;
  });
  handle('touchid:unlock', async () => {
    // Always show the system Touch ID sheet first (Electron LocalAuthentication).
    // Only then read the device-bound Keychain item — never safeStorage (login-password dialog).
    await systemPreferences.promptTouchID('解锁 HealthTrend 个人档案');
    return keychain(['load', KC_SERVICE, KC_ACCOUNT]);
  });
  handle('touchid:clear', async () => {
    try { keychain(['delete', KC_SERVICE, KC_ACCOUNT]); } catch { /* ignore */ }
    return true;
  });
  handle('print:report', async (event) => {
    return new Promise((resolve) => {
      event.sender.print({ landscape: true, pageSize: 'A4', printBackground: true }, (ok, reason) => resolve({ ok, reason }));
    });
  });
}

function registerProtocol() {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== HOST) return new Response('not found', { status: 404 });
    if (url.pathname.startsWith('/__backup/')) return new Response('{"error":"not available"}', { status: 404, headers: { 'content-type': 'application/json' } });
    const root = webRoot();
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.normalize(path.join(root, rel));
    if (!file.startsWith(root + path.sep)) return new Response('forbidden', { status: 403 });
    const info = await fs.stat(file).catch(() => null);
    const target = info && info.isFile() ? file : path.join(root, 'index.html');
    return net.fetch(pathToFileURL(target).toString());
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 920,
    minWidth: 900,
    minHeight: 640,
    title: 'HealthTrend',
    backgroundColor: '#f4f6fa',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${SCHEME}://${HOST}/`)) event.preventDefault();
  });
  const initial = process.env.HEALTHTREND_START_URL || `${SCHEME}://${HOST}/`;
  void win.loadURL(initial);
  return win;
}

app.setName('HealthTrend');
if (process.env.HEALTHTREND_USER_DATA) app.setPath('userData', process.env.HEALTHTREND_USER_DATA);

app.whenReady().then(() => {
  registerProtocol();
  registerIpc();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
