/**
 * Localhost-only encrypted backup endpoint for the Vite dev/preview server.
 * Enabled only when HEALTH_BACKUP_DIR is set (the Desktop launcher sets it to the iCloud folder).
 * - Binds to whatever the server binds (launcher uses 127.0.0.1); rejects non-loopback peers.
 * - Requires Host/Origin of localhost + custom header (blocks cross-site and DNS-rebinding requests).
 * - Accepts ONLY already-encrypted envelopes; client never chooses a path (no traversal possible).
 */
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const BACKUP_FILE_NAME = 'health-trend-personal.enc.json';
export const HISTORY_DIR_NAME = '备份历史';
const MAX_BODY_BYTES = 25 * 1024 * 1024;
const ALLOWED_TOP_LEVEL = new Set(['format', 'version', 'kdf', 'wrappedKey', 'cipher', 'createdAt']);

export interface BackupHandlerOptions {
  dir: string | undefined;
  keep?: number;
  /** Minimum age of newest history copy before writing another (ms). */
  rotateEveryMs?: number;
  now?: () => Date;
}

type Next = (error?: unknown) => void;

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function isLoopback(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function hostnameOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value.includes('://') ? value : `http://${value}`).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return null;
  }
}

function isLocalHostname(name: string | null): boolean {
  return name === '127.0.0.1' || name === 'localhost' || name === '::1';
}

/** Validates that a payload is an encrypted envelope and carries no plaintext record fields. */
export function isAcceptableEncryptedPayload(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some((key) => !ALLOWED_TOP_LEVEL.has(key))) return false;
  if (v.format !== 'health-trend-personal-enc' || v.version !== 2) return false;
  const kdf = v.kdf as Record<string, unknown> | undefined;
  const cipher = v.cipher as Record<string, unknown> | undefined;
  const wrapped = v.wrappedKey as Record<string, unknown> | undefined;
  if (!wrapped || wrapped.alg !== 'AES-GCM' || typeof wrapped.iv !== 'string' || typeof wrapped.ciphertext !== 'string') return false;
  if (!kdf || kdf.name !== 'PBKDF2' || typeof kdf.salt !== 'string' || typeof kdf.iterations !== 'number') return false;
  if (!cipher || cipher.alg !== 'AES-GCM' || typeof cipher.iv !== 'string' || typeof cipher.ciphertext !== 'string') return false;
  return /^[A-Za-z0-9+/=]+$/.test(cipher.ciphertext) && /^[A-Za-z0-9+/=]+$/.test(cipher.iv);
}

function stamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error('payload too large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function rotate(dir: string, keep: number, rotateEveryMs: number, now: Date): Promise<string | null> {
  const historyDir = join(dir, HISTORY_DIR_NAME);
  await mkdir(historyDir, { recursive: true });
  const names = (await readdir(historyDir)).filter((name) => /^health-trend-personal\.enc\.\d{8}-\d{6}\.json$/.test(name)).sort();
  const newest = names.at(-1);
  if (newest) {
    const info = await stat(join(historyDir, newest));
    if (now.getTime() - info.mtimeMs < rotateEveryMs) return null;
  }
  const target = `health-trend-personal.enc.${stamp(now)}.json`;
  await copyFile(join(dir, BACKUP_FILE_NAME), join(historyDir, target));
  const all = [...names, target].sort();
  for (const old of all.slice(0, Math.max(0, all.length - keep))) {
    await unlink(join(historyDir, old)).catch(() => undefined);
  }
  return target;
}

export function createBackupHandler(options: BackupHandlerOptions) {
  const keep = options.keep ?? 10;
  const rotateEveryMs = options.rotateEveryMs ?? 60 * 60 * 1000;
  const now = options.now ?? (() => new Date());

  return async function backupHandler(req: IncomingMessage, res: ServerResponse, next: Next): Promise<void> {
    const url = req.url ?? '';
    if (!url.startsWith('/__backup/')) return next();
    try {
      if (!isLoopback(req.socket.remoteAddress)) return send(res, 403, { error: 'loopback only' });
      if (!isLocalHostname(hostnameOf(req.headers.host))) return send(res, 403, { error: 'bad host' });
      const origin = req.headers.origin;
      if (origin && !isLocalHostname(hostnameOf(origin))) return send(res, 403, { error: 'bad origin' });
      if (req.headers['x-health-backup'] !== '1') return send(res, 403, { error: 'missing header' });

      const path = url.split('?')[0];
      if (path === '/__backup/status' && req.method === 'GET') {
        if (!options.dir) return send(res, 200, { enabled: false });
        const info = await stat(join(options.dir, BACKUP_FILE_NAME)).catch(() => null);
        return send(res, 200, { enabled: true, exists: Boolean(info), modifiedAt: info ? info.mtime.toISOString() : null });
      }
      if (!options.dir) return send(res, 404, { error: 'backup disabled' });
      const dir = options.dir;

      // One-shot plaintext restore drop: fixed filename only (no client-chosen path).
      if (path === '/__backup/pending-restore' && req.method === 'GET') {
        const text = await readFile(join(dir, '_pending-restore.json'), 'utf8').catch(() => null);
        if (text === null) return send(res, 404, { error: 'no pending restore' });
        let parsed: unknown;
        try { parsed = JSON.parse(text); } catch { return send(res, 400, { error: 'invalid pending restore' }); }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return send(res, 400, { error: 'invalid pending restore' });
        const rec = parsed as Record<string, unknown>;
        if (!('schemaVersion' in rec) || !('medications' in rec)) return send(res, 400, { error: 'not a health record' });
        return send(res, 200, parsed);
      }
      if (path === '/__backup/pending-restore' && req.method === 'DELETE') {
        await unlink(join(dir, '_pending-restore.json')).catch(() => undefined);
        await unlink(join(dir, '待导入_个人资料.json')).catch(() => undefined);
        return send(res, 200, { ok: true });
      }
      if (path === '/__backup/personal' && req.method === 'GET') {
        const text = await readFile(join(dir, BACKUP_FILE_NAME), 'utf8').catch(() => null);
        if (text === null) return send(res, 404, { error: 'no backup' });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(text);
        return;
      }
      if (path === '/__backup/personal' && req.method === 'POST') {
        if (!String(req.headers['content-type'] ?? '').includes('application/json')) return send(res, 415, { error: 'json only' });
        let payload: unknown;
        try {
          payload = JSON.parse(await readBody(req));
        } catch {
          return send(res, 400, { error: 'invalid body' });
        }
        if (!isAcceptableEncryptedPayload(payload)) return send(res, 400, { error: 'only encrypted backups are accepted' });
        await mkdir(dir, { recursive: true });
        const finalPath = join(dir, BACKUP_FILE_NAME);
        const tmpPath = join(dir, `.${BACKUP_FILE_NAME}.tmp`);
        await writeFile(tmpPath, `${JSON.stringify(payload)}\n`, { mode: 0o600 });
        await rename(tmpPath, finalPath);
        const at = now();
        const rotated = await rotate(dir, keep, rotateEveryMs, at);
        return send(res, 200, { ok: true, savedAt: at.toISOString(), rotated });
      }
      return send(res, 404, { error: 'not found' });
    } catch (error) {
      return send(res, 500, { error: error instanceof Error ? error.message : 'backup failed' });
    }
  };
}

/** Vite plugin wiring for dev + preview servers. */
export function healthBackupPlugin() {
  const handler = createBackupHandler({ dir: process.env.HEALTH_BACKUP_DIR || undefined });
  const use = (server: { middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: Next) => void) => void } }) => {
    server.middlewares.use((req, res, next) => { void handler(req, res, next); });
  };
  return {
    name: 'health-encrypted-backup',
    configureServer: use,
    configurePreviewServer: use,
  };
}
