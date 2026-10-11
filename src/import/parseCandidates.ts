export interface SourcePage {
  pageNumber: number;
  text: string;
  confidence: number | null;
}

export interface ImportCandidate {
  id: string;
  status: 'draft';
  kind: 'observation';
  pageNumber: number;
  sourceText: string;
  confidence: number | null;
  nameZh: string;
  nameEn: string;
  purposeZh: string;
  purposeEn: string;
  category: string;
  date: string;
  value: string;
  unit: string;
  lowerLimit: string;
  upperLimit: string;
  priority: boolean;
}

const NUMBER = '[-+]?(?:\\d+(?:[,.]\\d+)?|[,.]\\d+)';
const RANGE = new RegExp(`^\\(?\\s*(${NUMBER})\\s*(?:-|–|—|to|至)\\s*(${NUMBER})\\s*\\)?$`, 'i');
const AMBIGUOUS_RANGE = /\bor\b|\|/i;

function normalizeNumber(value: string): string {
  return value.replace(',', '.');
}

function extractRange(text: string): [string, string] {
  const groups = [...text.matchAll(/[([]([^\])]+)[)\]]/g)].map((match) => match[1].trim());
  if (groups.length !== 1 || AMBIGUOUS_RANGE.test(groups[0])) return ['', ''];
  const range = groups[0].match(RANGE);
  if (!range) return ['', ''];
  const low = Number(normalizeNumber(range[1]));
  const high = Number(normalizeNumber(range[2]));
  return Number.isFinite(low) && Number.isFinite(high) && low <= high
    ? [normalizeNumber(range[1]), normalizeNumber(range[2])]
    : ['', ''];
}

export function parseCandidates(source: SourcePage): ImportCandidate[] {
  const result: ImportCandidate[] = [];
  for (const rawLine of source.text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (!line || line.length > 240) continue;
    const valueMatch = line.match(new RegExp(`(?:^|\\s)(${NUMBER})(?=\\s|$)`));
    if (!valueMatch) continue;
    const value = normalizeNumber(valueMatch[1]);
    if (!Number.isFinite(Number(value))) continue;
    const valueIndex = valueMatch.index ?? 0;
    const valuePosition = line.indexOf(valueMatch[1], valueIndex);
    const before = line.slice(0, valuePosition).trim().replace(/[|:：;,]+$/, '').trim();
    const after = line.slice(valuePosition + valueMatch[1].length).trim();
    const unitMatch = after.match(/^(%|(?:m?u|n|p|f)?(?:mol|g|kat|eq|cells?|copies|IU|U|L|dL|mL|µL|μL|umol|µmol|μmol|ng|pg|mg|mmol)(?:\s*\/\s*[\wµμ]+)?(?:\s*\^?\d+)?)/i);
    if (before.length < 2 || !unitMatch) continue;
    if (/^(?:mg|g|mcg|µg|μg|ug)$/i.test(unitMatch[0].replace(/\s+/g, ''))) continue;
    const [lowerLimit, upperLimit] = extractRange(after.slice(unitMatch[0].length));
    result.push({
      id: crypto.randomUUID(), status: 'draft', kind: 'observation', pageNumber: source.pageNumber,
      sourceText: line, confidence: source.confidence, nameZh: '', nameEn: before,
      purposeZh: '', purposeEn: '', category: '', date: '', value, unit: unitMatch[0].replace(/\s+/g, ''),
      lowerLimit, upperLimit, priority: false,
    });
  }
  return result;
}
