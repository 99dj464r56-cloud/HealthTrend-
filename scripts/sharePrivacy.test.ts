import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GENERIC_MARKERS, scanForPersonalData } from './sharePrivacy';

let dir: string;
const markers = [...GENERIC_MARKERS, 'Synthetic Person', '1900-01-01'];

describe('share build privacy scan', () => {
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'share-scan-')); await mkdir(join(dir, 'app/seeds'), { recursive: true }); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('passes a clean guest/demo build', async () => {
    await writeFile(join(dir, 'app/index.html'), '<title>HealthTrend</title>');
    await writeFile(join(dir, 'app/seeds/demo-record.json'), '{"profile":{"displayName":"示范用户 / Demo User"}}');
    expect(await scanForPersonalData(dir, markers)).toEqual([]);
  });

  it('flags personal names, DOB, the personal seed file and local paths', async () => {
    await writeFile(join(dir, 'app/seeds/personal-backup.json'), '{}');
    const homePath = ['', 'Users', 'someone', 'x'].join('/');
    await writeFile(join(dir, 'app/a.js'), `const n="synthetic person"; const p="${homePath}";`);
    await writeFile(join(dir, 'app/b.bin'), Buffer.from('xx1900-01-01xx', 'latin1'));
    const found = (await scanForPersonalData(dir, markers)).map((f) => `${f.file}:${f.marker}`);
    expect(found).toEqual(expect.arrayContaining([
      'app/seeds/personal-backup.json:personal-backup.json',
      'app/a.js:Synthetic Person',
      `app/a.js:${['', 'Users', ''].join('/')}`,
      'app/b.bin:1900-01-01',
    ]));
  });
});
