import { createHash } from 'node:crypto';
import { readdir, lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const staticFiles = [
  '.nojekyll', 'index.html', '404.html', 'manifest.webmanifest',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'ocr/worker.min.js', 'ocr/core/tesseract-core-simd-lstm.wasm.js',
  'ocr/core/tesseract-core-simd-lstm.wasm', 'ocr/lang/chi_sim.traineddata.gz',
  'ocr/lang/eng.traineddata.gz', 'seeds/demo-record.json',
];
const generated = /^assets\/(?:index-[\w-]+\.(?:js|css)|pdf\.worker\.min-[\w-]+\.mjs)$/;
/** Inventory the entire output, rejecting unexpected files and all symlinks. */
export async function auditPublicArtifact(dir, committedDemo, { required = staticFiles.filter(path => !['.nojekyll', '404.html'].includes(path)) } = {}) {
  const manifest = [];
  async function walk(relative = '') {
    for (const name of await readdir(join(dir, relative))) {
      const path = relative ? `${relative}/${name}` : name;
      const info = await lstat(join(dir, path));
      if (info.isSymbolicLink()) throw new Error(`Symlink in public artifact: ${path}`);
      if (info.isDirectory()) { await walk(path); continue; }
      if (!info.isFile() || (!staticFiles.includes(path) && !generated.test(path))) {
        throw new Error(`Unexpected public artifact: ${path}`);
      }
      const bytes = await readFile(join(dir, path));
      if (path === 'seeds/demo-record.json' && !bytes.equals(Buffer.from(committedDemo))) {
        throw new Error('Demo seed differs from committed synthetic data');
      }
      manifest.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }
  await walk();
  for (const path of required) if (!manifest.some(file => file.path === path)) throw new Error(`Missing public artifact: ${path}`);
  return manifest.sort((a, b) => a.path.localeCompare(b.path));
}
