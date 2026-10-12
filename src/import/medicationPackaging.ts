/**
 * Helpers that keep package OCR drafts from confusing pack counts with dose strength.
 * Deep OCR is out of scope; these fields force an explicit split.
 */

export interface MedicationPackagingDraft {
  /** Strength on the label, e.g. "50 mg". */
  strengthLabel: string;
  /** Tablets / volume taken each time — not the bottle count. */
  doseAmount: string | null;
  doseUnit: string | null;
  frequency: string;
  form: string | null;
  /** e.g. "200 tablets" — never copied into strength or doseAmount. */
  packCountLabel: string | null;
  warnings: string[];
}

const PACK_COUNT = /(\d+)\s*(?:tablets?|capsules?|pills?|片|粒|颗)\b/i;
const STRENGTH = /(\d+(?:\.\d+)?)\s*(mg|mcg|µg|μg|g|iu|units?)\b/i;

/**
 * Parse free-text packaging OCR into structured fields.
 * Explicitly refuses to treat a pack count like "200 tablets" as a milligram dose.
 */
export function parseMedicationPackagingDraft(ocrText: string): MedicationPackagingDraft {
  const text = ocrText.trim();
  const warnings: string[] = [];
  const packMatch = text.match(PACK_COUNT);
  const strengthMatch = text.match(STRENGTH);

  let packCountLabel: string | null = null;
  if (packMatch) {
    packCountLabel = `${packMatch[1]} ${packMatch[0].replace(packMatch[1], '').trim()}`.replace(/\s+/g, ' ');
    // Guard: numeric pack counts must not become mg doses.
    warnings.push('Pack count detected; it was kept as packCountLabel and not used as a milligram dose.');
  }

  const strengthLabel = strengthMatch ? `${strengthMatch[1]} ${strengthMatch[2]}` : '';
  if (!strengthLabel && packMatch) {
    warnings.push('No separate strength found; refuse to treat pack count as dose strength.');
  }

  return {
    strengthLabel,
    doseAmount: null,
    doseUnit: null,
    frequency: '',
    form: null,
    packCountLabel,
    warnings,
  };
}

export function formatRegimenStageSummary(stage: {
  strengthLabel: string;
  doseAmount: string | null;
  doseUnit: string | null;
  frequency: string;
  form: string | null;
  packCountLabel: string | null;
}): string {
  const dose = stage.doseAmount
    ? `${stage.doseAmount}${stage.doseUnit ? ` ${stage.doseUnit}` : ''}`
    : '单次剂量未记录';
  const pack = stage.packCountLabel ? ` · 包装 ${stage.packCountLabel}` : '';
  const form = stage.form ? ` · ${stage.form}` : '';
  return `${stage.strengthLabel} · ${dose} · ${stage.frequency}${form}${pack}`;
}
