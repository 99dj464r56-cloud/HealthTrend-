export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_PAGES = 20;

export function validateImportFile(file: File, pageCount?: number): void {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const isImage = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    || /\.(jpe?g|png|webp)$/i.test(file.name);
  if (!isPdf && !isImage) throw new Error('仅支持 PDF、JPG、PNG 或 WebP 文件；HEIC/TIFF 请先转换为 JPG/PNG。');
  if (file.size <= 0) throw new Error('文件为空，请选择有效的照片或 PDF。');
  if (file.size > MAX_IMPORT_BYTES) throw new Error('单个文件不能超过 20 MB。');
  if (pageCount !== undefined && (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > MAX_PDF_PAGES)) {
    throw new Error('每份 PDF 最多处理 20 页；请拆分文件后再导入。');
  }
}
