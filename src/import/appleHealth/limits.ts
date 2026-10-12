/** Caps for Apple Health export XML / ZIP (in-browser only). */
export const MAX_APPLE_HEALTH_FILE_BYTES = 40 * 1024 * 1024;
export const MAX_APPLE_HEALTH_XML_BYTES = 80 * 1024 * 1024;
export const MAX_APPLE_HEALTH_ZIP_ENTRIES = 50;
export const MAX_APPLE_HEALTH_RECORDS = 50_000;
export const MAX_APPLE_HEALTH_NODE_DEPTH = 32;
export const MAX_APPLE_HEALTH_ELEMENT_SCAN = 200_000;

export const APPLE_HEALTH_EXPORT_XML_NAMES = new Set([
  'export.xml',
  'export_cda.xml',
]);
