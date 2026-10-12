/**
 * Helpers that keep package OCR drafts from confusing pack counts with dose strength,
 * and produce medication import drafts from photo/PDF OCR text (user must confirm).
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

export interface MedicationImportCandidate {
  id: string;
  status: 'draft';
  kind: 'medication';
  pageNumber: number;
  sourceText: string;
  confidence: number | null;
  nameZh: string;
  nameEn: string;
  strengthLabel: string;
  doseAmount: string;
  doseUnit: string;
  frequency: string;
  form: string;
  packCountLabel: string;
  /** Suggested linked indicator names for the user to confirm — never invents lab values. */
  linkedIndicatorHints: string;
  warnings: string[];
}

const PACK_COUNT = /(\d+)\s*(?:tablets?|capsules?|pills?|片|粒|颗)(?=\s|$|[，。；;,.\/）)])/i;
const STRENGTH = /(\d+(?:\.\d+)?)\s*(mg|mcg|µg|μg|g|iu|units?|毫升|ml)\b/i;
const DOSE_TAKE = /(?:take|服用|一次|每次)\s*(\d+(?:\.\d+)?)\s*(tablet|capsule|pill|片|粒|颗|半片)?/i;
const FREQUENCY = /(?:每晚一片|每晚一次|每日一次|每日半片|每天一次|once daily|once a day|daily|every night|nocte|每次一[片粒颗]|一日一次)/i;
const FORM = /(?:tablet|capsule|injection|肠溶|缓释|注射液|预充|片剂|胶囊)/i;

/** Latin / bilingual drug name line heuristics (pharmacy labels). */
const LATIN_DRUG = /\b([A-Z][A-Za-z][A-Za-z-]{2,}(?:-[A-Z]{2,})?)\b/;
const ZH_DRUG = /([\u4e00-\u9fff]{2,12}(?:片|胶囊|注射液|单抗)?)/;

type HintRule = { match: RegExp; hints: string; nameZh?: string };

const MONITORING_HINTS: HintRule[] = [
  { match: /rosuvastatin|瑞舒伐他汀|阿托伐他汀|atorvastatin|他汀/i, hints: 'LDL-C；总胆固醇；甘油三酯；HDL-C；肝酶', nameZh: '瑞舒伐他汀' },
  { match: /ezetimibe|依折麦布|益适纯/i, hints: 'LDL-C；总胆固醇；甘油三酯；HDL-C', nameZh: '依折麦布' },
  { match: /telmisartan|替米沙坦|氯沙坦|losartan|沙坦/i, hints: '血压；肾功能；血钾', nameZh: '替米沙坦' },
  { match: /metoprolol|美托洛尔|倍他乐克|betaloc/i, hints: '心率；血压', nameZh: '美托洛尔' },
  { match: /aspirin|阿司匹林|cartia/i, hints: '血小板；出血风险观察', nameZh: '低剂量阿司匹林' },
  { match: /stapokibart|司普奇拜/i, hints: '嗜酸性粒细胞；处方适应症相关监测', nameZh: '司普奇拜单抗注射液' },
];

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
    warnings.push('Pack count detected; it was kept as packCountLabel and not used as a milligram dose.');
  }

  const strengthLabel = strengthMatch ? `${strengthMatch[1]} ${strengthMatch[2]}` : '';
  if (!strengthLabel && packMatch) {
    warnings.push('No separate strength found; refuse to treat pack count as dose strength.');
  }

  const doseMatch = text.match(DOSE_TAKE);
  let doseAmount: string | null = null;
  let doseUnit: string | null = null;
  if (doseMatch) {
    doseAmount = doseMatch[1] ?? null;
    doseUnit = doseMatch[2] ?? 'tablet';
  }

  const frequencyMatch = text.match(FREQUENCY);
  const formMatch = text.match(FORM);

  return {
    strengthLabel,
    doseAmount,
    doseUnit,
    frequency: frequencyMatch ? frequencyMatch[0] : '',
    form: formMatch ? formMatch[0] : null,
    packCountLabel,
    warnings,
  };
}

/** Empty endDate means ongoing use (仍使用). Empty startDate is omitted. */
export function formatRegimenStagePeriod(stage: {
  startDate: string | null;
  endDate: string | null;
}): string | null {
  if (!stage.startDate && !stage.endDate) return null;
  if (stage.startDate && stage.endDate) return `${stage.startDate} – ${stage.endDate}`;
  if (stage.startDate) return `${stage.startDate} – 仍使用`;
  return `至 ${stage.endDate}`;
}

export function formatRegimenStageSummary(stage: {
  strengthLabel: string;
  doseAmount: string | null;
  doseUnit: string | null;
  frequency: string;
  form: string | null;
  packCountLabel: string | null;
  startDate?: string | null;
  endDate?: string | null;
}): string {
  const dose = stage.doseAmount
    ? `${stage.doseAmount}${stage.doseUnit ? ` ${stage.doseUnit}` : ''}`
    : '单次剂量未记录';
  const pack = stage.packCountLabel ? ` · 包装 ${stage.packCountLabel}` : '';
  const form = stage.form ? ` · ${stage.form}` : '';
  const period = formatRegimenStagePeriod({
    startDate: stage.startDate ?? null,
    endDate: stage.endDate ?? null,
  });
  const when = period ? ` · ${period}` : '';
  return `${stage.strengthLabel} · ${dose} · ${stage.frequency}${form}${pack}${when}`;
}

function looksLikeMedicationPage(text: string): boolean {
  return /mg\b|tablet|capsule|片|粒|注射液|pharmacy|药房|每晚|daily|dose|用药|处方/i.test(text)
    || MONITORING_HINTS.some((rule) => rule.match.test(text));
}

function extractNames(text: string): { nameZh: string; nameEn: string } {
  for (const rule of MONITORING_HINTS) {
    if (rule.match.test(text) && rule.nameZh) {
      const latin = text.match(rule.match);
      return {
        nameZh: rule.nameZh,
        nameEn: latin?.[0] ?? rule.nameZh,
      };
    }
  }
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let nameEn = '';
  let nameZh = '';
  for (const line of lines.slice(0, 8)) {
    if (!nameEn) {
      const latin = line.match(LATIN_DRUG);
      if (latin && !/^(Tablet|Capsule|Bottle|Contains|Take|Daily|Night)$/i.test(latin[1]!)) {
        nameEn = latin[1]!;
      }
    }
    if (!nameZh) {
      const zh = line.match(ZH_DRUG);
      if (zh && zh[1]!.length >= 2 && !/含有|服用|每日|每晚|注意|保存/.test(zh[1]!)) {
        nameZh = zh[1]!;
      }
    }
  }
  return { nameZh, nameEn };
}

function monitoringHints(text: string): string {
  for (const rule of MONITORING_HINTS) {
    if (rule.match.test(text)) return rule.hints;
  }
  return '';
}

/**
 * Build medication drafts from an OCR/PDF text page.
 * Returns [] when the page does not look like a medication label / Rx text.
 * Never invents lab numeric values — only packaging fields + optional monitoring name hints.
 */
export function parseMedicationCandidates(source: {
  pageNumber: number;
  text: string;
  confidence: number | null;
}): MedicationImportCandidate[] {
  const text = source.text.trim();
  if (!text || !looksLikeMedicationPage(text)) return [];

  const packaging = parseMedicationPackagingDraft(text);
  const names = extractNames(text);
  const hints = monitoringHints(text);
  const warnings = [...packaging.warnings];
  if (!names.nameZh && !names.nameEn) {
    warnings.push('Drug name not confidently detected; fill bilingual names before confirming.');
  }
  if (!packaging.strengthLabel) {
    warnings.push('Strength not detected; confirm strength before saving a regimen stage.');
  }

  // Require at least a name hint or a strength to surface a draft (avoid empty noise cards).
  if (!names.nameZh && !names.nameEn && !packaging.strengthLabel) return [];

  return [{
    id: crypto.randomUUID(),
    status: 'draft',
    kind: 'medication',
    pageNumber: source.pageNumber,
    sourceText: text.slice(0, 400),
    confidence: source.confidence,
    nameZh: names.nameZh,
    nameEn: names.nameEn,
    strengthLabel: packaging.strengthLabel,
    doseAmount: packaging.doseAmount ?? '',
    doseUnit: packaging.doseUnit ?? '',
    frequency: packaging.frequency,
    form: packaging.form ?? '',
    packCountLabel: packaging.packCountLabel ?? '',
    linkedIndicatorHints: hints,
    warnings,
  }];
}
