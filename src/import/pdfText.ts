import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { OcrProgress, OcrSession } from './imageOcr';
import { createOcrSession } from './imageOcr';
import { formatPdfTextItems } from './pdfTextLayout';
import type { SourcePage } from './parseCandidates';
import { MAX_PDF_PAGES, validateImportFile } from './limits';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('导入已取消。', 'AbortError');
}

export async function extractPdfText(
  file: File,
  onProgress: (progress: number) => void = () => undefined,
  signal?: AbortSignal,
  onOcrProgress: (progress: OcrProgress) => void = () => undefined,
): Promise<SourcePage[]> {
  validateImportFile(file);
  if (!(file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
    throw new Error('所选文件不是 PDF。');
  }
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const document = await loadingTask.promise;
  if (document.numPages > MAX_PDF_PAGES) {
    await loadingTask.destroy();
    validateImportFile(file, document.numPages);
  }
  const pages: SourcePage[] = [];
  let ocr: OcrSession | null = null;
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      checkCancelled(signal);
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = formatPdfTextItems(content.items.flatMap((item) =>
        'str' in item ? [{ str: item.str, hasEOL: item.hasEOL }] : [],
      ));
      if (text.length >= 25) {
        pages.push({ pageNumber, text, confidence: null });
      } else {
        if (!ocr) ocr = await createOcrSession(onOcrProgress);
        const viewport = page.getViewport({ scale: 1.6 });
        const canvas = window.document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('无法在此浏览器中处理 PDF 扫描页。');
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        pages.push(await ocr.recognize(canvas, pageNumber, onOcrProgress));
        canvas.width = 0;
        canvas.height = 0;
      }
      page.cleanup();
      onProgress(pageNumber / document.numPages);
    }
  } finally {
    await ocr?.close();
    await loadingTask.destroy();
  }
  return pages;
}
