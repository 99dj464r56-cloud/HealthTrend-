import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { auditPublicArtifact } from './publicArtifact.mjs';
let dir: string;
afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });
async function fixture() {
  dir = await mkdtemp(join(tmpdir(), 'artifact-test-'));
  await mkdir(join(dir, 'seeds'));
  await writeFile(join(dir, 'seeds/demo-record.json'), '{}');
}
it('inventories committed synthetic seed with content hashes', async () => {
  await fixture();
  expect(await auditPublicArtifact(dir, '{}', { required: ['seeds/demo-record.json'] })).toEqual([
    { path: 'seeds/demo-record.json', bytes: 2, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) },
  ]);
});
it('rejects an unexpected health record anywhere in output', async () => {
  await fixture(); await writeFile(join(dir, 'seeds/accidental-record.json'), '{}');
  await expect(auditPublicArtifact(dir, '{}')).rejects.toThrow(/Unexpected/);
});
it('rejects modified demo data even with an allowed name', async () => {
  await fixture(); await expect(auditPublicArtifact(dir, 'committed')).rejects.toThrow(/differs/);
});
it('rejects symlinks instead of following them', async () => {
  await fixture(); await symlink('demo-record.json', join(dir, 'seeds/link.json'));
  await expect(auditPublicArtifact(dir, '{}')).rejects.toThrow(/Symlink/);
});
