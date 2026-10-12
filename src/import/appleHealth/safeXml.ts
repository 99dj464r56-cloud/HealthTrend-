import {
  MAX_APPLE_HEALTH_ELEMENT_SCAN,
  MAX_APPLE_HEALTH_NODE_DEPTH,
  MAX_APPLE_HEALTH_XML_BYTES,
} from './limits';

export class AppleHealthXmlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppleHealthXmlError';
  }
}

/**
 * Reject external entity / DTD expansion attacks while allowing Apple exports that
 * include a local DOCTYPE (stripped, never interpreted).
 */
export function sanitizeAppleHealthXml(xmlText: string): string {
  if (xmlText.length > MAX_APPLE_HEALTH_XML_BYTES) {
    throw new AppleHealthXmlError(`XML 解压后超过 ${MAX_APPLE_HEALTH_XML_BYTES / (1024 * 1024)} MiB 上限。`);
  }
  if (/<!ENTITY\b[^>]*\bSYSTEM\b/i.test(xmlText) || /<!ENTITY\b[^>]*\bPUBLIC\b/i.test(xmlText)) {
    throw new AppleHealthXmlError('拒绝含外部实体（SYSTEM/PUBLIC）的 XML。');
  }
  if (/<\?xml-stylesheet\b/i.test(xmlText)) {
    throw new AppleHealthXmlError('拒绝含外部样式表引用的 XML。');
  }
  // Strip DOCTYPE (Apple exports often include a local one). Never feed it to the parser.
  // Internal-subset form first so a nested ">" does not truncate the strip.
  let cleaned = xmlText.replace(/<!DOCTYPE[\s\S]*?\[[\s\S]*?\]\s*>/i, '');
  cleaned = cleaned.replace(/<!DOCTYPE[^>\[]*>/i, '');
  return cleaned;
}

export function parseAppleHealthDocument(xmlText: string): Document {
  const sanitized = sanitizeAppleHealthXml(xmlText);
  if (typeof DOMParser === 'undefined') {
    throw new AppleHealthXmlError('当前环境无法解析 XML。');
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitized, 'application/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new AppleHealthXmlError('XML 无法解析或已损坏。');
  }
  assertSafeTree(doc.documentElement, 0);
  return doc;
}

function assertSafeTree(node: Element | null, depth: number): void {
  if (!node) throw new AppleHealthXmlError('XML 根节点缺失。');
  if (depth > MAX_APPLE_HEALTH_NODE_DEPTH) {
    throw new AppleHealthXmlError(`XML 节点深度超过 ${MAX_APPLE_HEALTH_NODE_DEPTH} 层上限。`);
  }
  let scanned = 0;
  const walk = (el: Element, d: number): void => {
    scanned += 1;
    if (scanned > MAX_APPLE_HEALTH_ELEMENT_SCAN) {
      throw new AppleHealthXmlError(`XML 元素数量超过 ${MAX_APPLE_HEALTH_ELEMENT_SCAN} 上限。`);
    }
    if (d > MAX_APPLE_HEALTH_NODE_DEPTH) {
      throw new AppleHealthXmlError(`XML 节点深度超过 ${MAX_APPLE_HEALTH_NODE_DEPTH} 层上限。`);
    }
    for (const child of Array.from(el.children)) walk(child, d + 1);
  };
  walk(node, depth);
}
