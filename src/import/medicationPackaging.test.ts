import { describe, expect, it } from 'vitest';
import { parseMedicationPackagingDraft } from './medicationPackaging';

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
