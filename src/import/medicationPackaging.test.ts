import { describe, expect, it } from 'vitest';
import { parseMedicationCandidates, parseMedicationPackagingDraft } from './medicationPackaging';

describe('medication packaging draft parsing', () => {
  it('keeps pack counts out of strength and dose fields', () => {
    const draft = parseMedicationPackagingDraft('METOPROLOL 50 mg\nBottle contains 200 tablets\nTake one tablet daily');
    expect(draft.strengthLabel).toMatch(/50\s*mg/i);
    expect(draft.packCountLabel?.toLowerCase()).toContain('200');
    expect(draft.packCountLabel?.toLowerCase()).toContain('tablet');
    expect(draft.doseAmount).toBeNull();
    expect(draft.warnings.some((warning) => /pack count/i.test(warning))).toBe(true);
  });

  it('refuses to invent a mg dose from tablets-only packaging text', () => {
    const draft = parseMedicationPackagingDraft('Contains 200 tablets');
    expect(draft.strengthLabel).toBe('');
    expect(draft.packCountLabel).toMatch(/200/i);
    expect(draft.warnings.some((warning) => /refuse/i.test(warning))).toBe(true);
  });
});

describe('parseMedicationCandidates from OCR text', () => {
  it('builds a rosuvastatin packaging draft with monitoring hints and no invented lab values', () => {
    const text = [
      'ROSUVASTATIN-WGR',
      '瑞舒伐他汀',
      '10 mg',
      'Take one tablet every night',
      'Bottle contains 30 tablets',
    ].join('\n');
    const [draft] = parseMedicationCandidates({ pageNumber: 1, text, confidence: 88 });
    expect(draft).toBeDefined();
    expect(draft!.kind).toBe('medication');
    expect(draft!.strengthLabel).toMatch(/10\s*mg/i);
    expect(draft!.packCountLabel?.toLowerCase()).toContain('30');
    expect(draft!.linkedIndicatorHints).toMatch(/LDL/i);
    expect(draft!.nameZh.length + draft!.nameEn.length).toBeGreaterThan(0);
    // Never invent numeric lab observations here
    expect(JSON.stringify(draft)).not.toMatch(/"value"\s*:/);
  });

  it('returns empty when page has no medication-like cues', () => {
    const drafts = parseMedicationCandidates({
      pageNumber: 1,
      text: 'Creatinine 88.4 umol/L (44 - 110)\nGlucose 5.1 mmol/L',
      confidence: 90,
    });
    expect(drafts).toEqual([]);
  });

  it('parses Chinese pharmacy-style label and keeps 片 pack count out of mg strength', () => {
    const text = [
      '替米沙坦片',
      'Telmisartan Tablets',
      '规格：80 mg',
      '包装：28 片',
      '用法：每晚一片',
    ].join('\n');
    const packaging = parseMedicationPackagingDraft(text);
    expect(packaging.strengthLabel).toMatch(/80\s*mg/i);
    expect(packaging.packCountLabel).toMatch(/28/);
    expect(packaging.strengthLabel).not.toMatch(/28/);
    const [draft] = parseMedicationCandidates({ pageNumber: 1, text, confidence: 76 });
    expect(draft?.nameZh).toMatch(/替米沙坦/);
    expect(draft?.linkedIndicatorHints).toMatch(/肾|血压/);
    expect(draft?.packCountLabel).toMatch(/28/);
  });
});

import { formatRegimenStagePeriod, formatRegimenStageSummary } from './medicationPackaging';

describe('regimen stage summary dates', () => {
  it('shows 仍使用 when endDate is empty and keeps strength/frequency', () => {
    expect(formatRegimenStagePeriod({ startDate: '2024-05-01', endDate: null })).toBe('2024-05-01 – 仍使用');
    expect(formatRegimenStagePeriod({ startDate: null, endDate: null })).toBeNull();
    expect(formatRegimenStageSummary({
      strengthLabel: '80 mg',
      doseAmount: '1',
      doseUnit: 'tablet',
      frequency: '每晚一片',
      form: null,
      packCountLabel: null,
      startDate: '2024-05-01',
      endDate: null,
    })).toContain('2024-05-01 – 仍使用');
  });
});
