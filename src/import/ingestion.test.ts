import { describe, expect, it } from 'vitest';
import { parseCandidates, type SourcePage } from './parseCandidates';
import { validateImportFile, MAX_IMPORT_BYTES, MAX_PDF_PAGES } from './limits';

describe('health document ingestion', () => {
  it('creates unconfirmed numeric drafts and preserves explicit bounds without inventing absent fields', () => {
    const source: SourcePage = {
      pageNumber: 2,
      text: 'Creatinine 88.4 umol/L (44 - 110)\nGlucose 5.1 mmol/L',
      confidence: 94,
    };
    const candidates = parseCandidates(source);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      status: 'draft', pageNumber: 2, value: '88.4', unit: 'umol/L',
      lowerLimit: '44', upperLimit: '110', nameEn: 'Creatinine', nameZh: '',
    });
    expect(candidates[1]).toMatchObject({ value: '5.1', lowerLimit: '', upperLimit: '', date: '' });
    expect(candidates.every((candidate) => candidate.status === 'draft')).toBe(true);
  });

  it('keeps ambiguous ranges blank instead of guessing', () => {
    const source: SourcePage = { pageNumber: 1, text: 'Test 5.0 mmol/L (3.0-4.0 or 6.0-7.0)', confidence: 60 };
    expect(parseCandidates(source)[0]).toMatchObject({ lowerLimit: '', upperLimit: '' });
  });

  it('rejects unsupported files and files above the local processing limit', () => {
    expect(() => validateImportFile({ name: 'notes.txt', type: 'text/plain', size: 1 } as File)).toThrow(/支持/);
    expect(() => validateImportFile({ name: 'large.pdf', type: 'application/pdf', size: MAX_IMPORT_BYTES + 1 } as File)).toThrow(/20 MB/);
  });

  it('rejects PDFs whose page count exceeds the bounded processing limit', () => {
    expect(MAX_PDF_PAGES).toBe(20);
    expect(() => validateImportFile({ name: 'long.pdf', type: 'application/pdf', size: 100 } as File, MAX_PDF_PAGES + 1)).toThrow(/20 页/);
  });
});
