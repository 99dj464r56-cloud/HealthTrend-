import { describe, expect, it } from 'vitest';
import { parseCandidates, type SourcePage } from './parseCandidates';
import { validateImportFile, MAX_IMPORT_BYTES, MAX_PDF_PAGES } from './limits';
import { formatPdfTextItems } from './pdfTextLayout';
import { createManualObservation } from './manual';

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

  it('preserves PDF text-layer row boundaries so multiple results remain separate candidates', () => {
    const text = formatPdfTextItems([
      { str: 'Creatinine', hasEOL: false },
      { str: '88.4', hasEOL: false },
      { str: 'umol/L', hasEOL: true },
      { str: 'Glucose', hasEOL: false },
      { str: '5.1', hasEOL: false },
      { str: 'mmol/L', hasEOL: true },
    ]);
    expect(text).toBe('Creatinine 88.4 umol/L\nGlucose 5.1 mmol/L');
    const candidates = parseCandidates({ pageNumber: 1, text, confidence: null });
    expect(candidates.map(({ nameEn, value, unit }) => ({ nameEn, value, unit }))).toEqual([
      { nameEn: 'Creatinine', value: '88.4', unit: 'umol/L' },
      { nameEn: 'Glucose', value: '5.1', unit: 'mmol/L' },
    ]);
  });

  it('honors PDF.js standalone empty end-of-line fragments', () => {
    expect(formatPdfTextItems([
      { str: 'Creatinine 88.4 umol/L', hasEOL: false },
      { str: '', hasEOL: true },
      { str: 'Glucose 5.1 mmol/L', hasEOL: false },
    ])).toBe('Creatinine 88.4 umol/L\nGlucose 5.1 mmol/L');
  });

  it('retains source provenance when an imported observation is manually edited', () => {
    const indicator = {
      id: 'creatinine', nameZh: '肌酐', nameEn: 'Creatinine', purposeZh: '', purposeEn: '', category: '肾功能',
      unit: 'umol/L', lowerLimit: 44, upperLimit: 110, priority: false,
    };
    const edited = createManualObservation(indicator, {
      id: 'result-1', date: '2026-06-26', value: '88.4', pageNumber: 3,
    }, 'report-1');
    expect(edited).toMatchObject({
      sourceId: 'report-1', pageNumber: 3, date: '2026-06-26',
      rawValue: '88.4', value: 88.4, comparator: 'none',
      lowerLimit: 44, upperLimit: 110, rangeProvenance: 'from-report',
    });
  });

  it('does not misclassify a bare medicine strength as a lab result', () => {
    const source: SourcePage = {
      pageNumber: 1,
      text: 'DEMO-BETA-BLOCKER 50 mg\nTake a half tablet daily',
      confidence: 90,
    };
    expect(parseCandidates(source)).toEqual([]);
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
