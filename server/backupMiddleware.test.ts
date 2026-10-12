import { createServer, request, type Server } from 'node:http';
import { mkdtemp, readdir, readFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BACKUP_FILE_NAME, HISTORY_DIR_NAME, createBackupHandler, isAcceptableEncryptedPayload } from './backupMiddleware';
import { buildBackupFile, createVault } from '../src/security/vault';

let dir: string;
let server: Server;
let port: number;
let clock = Date.parse('2026-10-12T10:00:00+08:00');

function call(method: string, path: string, body?: string, headers: Record<string, string> = {}): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers: {
      'X-Health-Backup': '1', 'Content-Type': 'application/json', Host: `127.0.0.1:${port}`, ...headers,
    } }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function encryptedPayload(): Promise<string> {
  const { meta, key } = await createVault('test-only-password', 100_000);
  return JSON.stringify(await buildBackupFile(meta, key, { profile: { displayName: 'Payload Probe' } }));
}

describe('localhost encrypted backup middleware', () => {
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'health-backup-test-'));
    const handler = createBackupHandler({ dir, keep: 10, rotateEveryMs: 0, now: () => new Date(clock += 61_000) });
    server = createServer((req, res) => void handler(req, res, () => { res.statusCode = 404; res.end(); }));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as { port: number }).port;
  });
  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });

  it('writes an encrypted backup to the fixed filename and reads it back', async () => {
    const payload = await encryptedPayload();
    const saved = await call('POST', '/__backup/personal', payload);
    expect(saved.status).toBe(200);
    const onDisk = await readFile(join(dir, BACKUP_FILE_NAME), 'utf8');
    expect(onDisk).not.toContain('Payload Probe');
    expect(JSON.parse(onDisk)).toEqual(JSON.parse(payload));
    const status = JSON.parse((await call('GET', '/__backup/status')).text);
    expect(status).toMatchObject({ enabled: true, exists: true });
    expect(JSON.parse((await call('GET', '/__backup/personal')).text)).toEqual(JSON.parse(payload));
  });

  it('rejects plaintext records and extra fields', async () => {
    const plain = JSON.stringify({ schemaVersion: 4, profile: { displayName: 'Plain' }, observations: [] });
    expect((await call('POST', '/__backup/personal', plain)).status).toBe(400);
    const extra = JSON.stringify({ ...JSON.parse(await encryptedPayload()), record: { displayName: 'Leak' } });
    expect((await call('POST', '/__backup/personal', extra)).status).toBe(400);
    expect(isAcceptableEncryptedPayload(JSON.parse(plain))).toBe(false);
    expect(await readdir(dir)).toEqual([]);
  });

  it('rejects requests without the header, with a foreign Host or Origin', async () => {
    const payload = await encryptedPayload();
    expect((await call('POST', '/__backup/personal', payload, { 'X-Health-Backup': '0' })).status).toBe(403);
    expect((await call('POST', '/__backup/personal', payload, { Host: 'evil.example' })).status).toBe(403);
    expect((await call('POST', '/__backup/personal', payload, { Origin: 'https://evil.example' })).status).toBe(403);
  });

  it('never lets the client choose a path (traversal attempts write nothing)', async () => {
    const payload = await encryptedPayload();
    for (const path of ['/__backup/../../evil.json', '/__backup/personal/../../x', '/__backup/%2e%2e%2fevil', '/__backup/personal?name=../../x']) {
      const res = await call('POST', path, payload);
      if (res.status === 200) expect(path).toContain('?'); // query ignored, fixed filename used
    }
    const files = await readdir(dir);
    expect(files.filter((f) => f !== HISTORY_DIR_NAME).every((f) => f === BACKUP_FILE_NAME)).toBe(true);
  });

  it('keeps at most 10 dated rotations', async () => {
    const payload = await encryptedPayload();
    for (let i = 0; i < 13; i += 1) {
      expect((await call('POST', '/__backup/personal', payload)).status).toBe(200);
      const history = join(dir, HISTORY_DIR_NAME);
      // age newest copy so the next write rotates
      for (const name of await readdir(history)) await utimes(join(history, name), 0, 0);
    }
    const history = await readdir(join(dir, HISTORY_DIR_NAME));
    expect(history).toHaveLength(10);
  });
});
