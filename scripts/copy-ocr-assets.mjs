import { mkdir, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = process.cwd();
const pairs = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'public/ocr/worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'public/ocr/core/tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm', 'public/ocr/core/tesseract-core-simd-lstm.wasm'],
  ['node_modules/@tesseract.js-data/chi_sim/4.0.0/chi_sim.traineddata.gz', 'public/ocr/lang/chi_sim.traineddata.gz'],
  ['node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz', 'public/ocr/lang/eng.traineddata.gz'],
];

for (const [source, destination] of pairs) {
  const target = resolve(root, destination);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(root, source), target);
}

console.info('Prepared same-origin OCR runtime assets in public/ocr/.');
