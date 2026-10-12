import {
  APPLE_HEALTH_EXPORT_XML_NAMES,
  MAX_APPLE_HEALTH_FILE_BYTES,
  MAX_APPLE_HEALTH_XML_BYTES,
  MAX_APPLE_HEALTH_ZIP_ENTRIES,
} from './limits';
import { AppleHealthXmlError } from './safeXml';

const ZIP_LOCAL = 0x04034b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_EOCD = 0x06054b50;

function readAscii(view: DataView, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(view.getUint8(offset + i));
  return out;
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new AppleHealthXmlError('当前浏览器不支持 ZIP 解压（需要 DecompressionStream）。');
  }
  const stream = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

function findEocd(view: DataView): number {
  // EOCD is at the end; scan backwards a limited window.
  const maxScan = Math.min(view.byteLength, 65_536);
  for (let i = view.byteLength - 22; i >= view.byteLength - maxScan; i -= 1) {
    if (view.getUint32(i, true) === ZIP_EOCD) return i;
  }
  throw new AppleHealthXmlError('ZIP 结构无效（找不到 EOCD）。');
}

/**
 * Extract only the Apple Health export XML from a ZIP. Ignores routes, ECG, and other attachments.
 */
export async function extractAppleHealthXmlFromZip(fileBytes: Uint8Array): Promise<{ fileName: string; xmlText: string }> {
  if (fileBytes.byteLength > MAX_APPLE_HEALTH_FILE_BYTES) {
    throw new AppleHealthXmlError(`ZIP 超过 ${MAX_APPLE_HEALTH_FILE_BYTES / (1024 * 1024)} MiB 上限。`);
  }
  const view = new DataView(fileBytes.buffer, fileBytes.byteOffset, fileBytes.byteLength);
  const eocd = findEocd(view);
  const totalEntries = view.getUint16(eocd + 10, true);
  if (totalEntries > MAX_APPLE_HEALTH_ZIP_ENTRIES) {
    throw new AppleHealthXmlError(`ZIP 内条目超过 ${MAX_APPLE_HEALTH_ZIP_ENTRIES} 上限（疑似解压炸弹）。`);
  }
  const centralOffset = view.getUint32(eocd + 16, true);
  let offset = centralOffset;
  const candidates: Array<{ name: string; localHeader: number; compressed: number; uncompressed: number; method: number }> = [];

  for (let i = 0; i < totalEntries; i += 1) {
    if (view.getUint32(offset, true) !== ZIP_CENTRAL) {
      throw new AppleHealthXmlError('ZIP central directory 损坏。');
    }
    const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true);
    const uncompressed = view.getUint32(offset + 24, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localHeader = view.getUint32(offset + 42, true);
    const name = readAscii(view, offset + 46, nameLen).replace(/\\/g, '/');
    offset += 46 + nameLen + extraLen + commentLen;

    const base = name.split('/').pop()?.toLowerCase() ?? '';
    if (APPLE_HEALTH_EXPORT_XML_NAMES.has(base) && base === 'export.xml') {
      candidates.push({ name, localHeader, compressed, uncompressed, method });
    }
    // Explicitly ignore workout routes / ECG / CDA / other attachments.
  }

  if (!candidates.length) {
    throw new AppleHealthXmlError('ZIP 中未找到 export.xml（已忽略路线/心电图等附件）。');
  }
  if (candidates.length > 1) {
    throw new AppleHealthXmlError('ZIP 中存在多个 export.xml，请提供仅含一份导出的压缩包。');
  }
  const entry = candidates[0]!;
  if (entry.uncompressed > MAX_APPLE_HEALTH_XML_BYTES) {
    throw new AppleHealthXmlError('ZIP 内 XML 解压后体积超过上限（疑似解压炸弹）。');
  }
  if (view.getUint32(entry.localHeader, true) !== ZIP_LOCAL) {
    throw new AppleHealthXmlError('ZIP local header 损坏。');
  }
  const localNameLen = view.getUint16(entry.localHeader + 26, true);
  const localExtraLen = view.getUint16(entry.localHeader + 28, true);
  const dataStart = entry.localHeader + 30 + localNameLen + localExtraLen;
  const compressedBytes = fileBytes.subarray(dataStart, dataStart + entry.compressed);

  let xmlBytes: Uint8Array;
  if (entry.method === 0) {
    xmlBytes = compressedBytes;
  } else if (entry.method === 8) {
    xmlBytes = await inflateRaw(compressedBytes);
  } else {
    throw new AppleHealthXmlError(`不支持的 ZIP 压缩方式（method=${entry.method}）。`);
  }
  if (xmlBytes.byteLength > MAX_APPLE_HEALTH_XML_BYTES) {
    throw new AppleHealthXmlError('解压后 XML 超过大小上限。');
  }
  const xmlText = new TextDecoder('utf-8', { fatal: false }).decode(xmlBytes);
  return { fileName: entry.name, xmlText };
}
