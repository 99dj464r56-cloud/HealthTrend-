import { createWorker, type Worker } from 'tesseract.js';
import type { SourcePage } from './parseCandidates';

export interface OcrProgress {
  progress: number;
  message: string;
}

export interface OcrSession {
  recognize(image: File | HTMLCanvasElement, pageNumber: number, onProgress?: (progress: OcrProgress) => void): Promise<SourcePage>;
  close(): Promise<void>;
}

function ocrAsset(path: string): string {
  return new URL(`${import.meta.env.BASE_URL}ocr/${path}`, window.location.origin).toString();
}

export async function createOcrSession(onProgress: (progress: OcrProgress) => void = () => undefined): Promise<OcrSession> {
  let activeWorker: Worker | null = null;
  const worker = await createWorker('chi_sim+eng', undefined, {
    workerPath: ocrAsset('worker.min.js'),
    corePath: ocrAsset('core/tesseract-core-simd-lstm.wasm.js'),
    langPath: ocrAsset('lang/'),
    workerBlobURL: false,
    cacheMethod: 'write',
    gzip: true,
    logger: ({ status, progress }) => onProgress({ progress, message: status }),
  });
  activeWorker = worker;
  return {
    async recognize(image, pageNumber, progress = () => undefined) {
      if (!activeWorker) throw new Error('OCR 识别已结束。');
      const result = await activeWorker.recognize(image, {}, { text: true });
      const confidence = Number.isFinite(result.data.confidence) ? result.data.confidence : null;
      progress({ progress: 1, message: '文字识别完成' });
      return { pageNumber, text: result.data.text, confidence };
    },
    async close() {
      if (!activeWorker) return;
      const current = activeWorker;
      activeWorker = null;
      await current.terminate();
    },
  };
}

export async function recognizeImage(file: File, onProgress: (progress: OcrProgress) => void = () => undefined, signal?: AbortSignal): Promise<SourcePage> {
  if (signal?.aborted) throw new DOMException('导入已取消。', 'AbortError');
  const session = await createOcrSession(onProgress);
  const cancel = () => { void session.close(); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const result = await session.recognize(file, 1, onProgress);
    if (signal?.aborted) throw new DOMException('导入已取消。', 'AbortError');
    return result;
  } finally {
    signal?.removeEventListener('abort', cancel);
    await session.close();
  }
}
