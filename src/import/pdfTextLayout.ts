export interface PdfTextFragment {
  str: string;
  hasEOL: boolean;
}

/** Reconstruct PDF.js text items while retaining its explicit line boundaries. */
export function formatPdfTextItems(items: readonly PdfTextFragment[]): string {
  let text = '';
  for (const item of items) {
    if (item.str) text += item.str;
    if (item.hasEOL) text += '\n';
    else if (item.str) text += ' ';
  }
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}
