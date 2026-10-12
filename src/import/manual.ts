import type {
  Indicator,
  Observation,
  RangeProvenance,
  ValueComparator,
} from '../domain/types';

export interface ManualObservationFields {
  id: string;
  date: string;
  value: string;
  pageNumber?: number | null;
  lowerLimit?: string;
  upperLimit?: string;
  laboratory?: string | null;
  method?: string | null;
  specimen?: string | null;
  rangeProvenance?: RangeProvenance;
  /** When editing, retain prior observation fields not present on the form. */
  previous?: Observation | null;
}

export function parseOptionalLimit(rawValue: string): number | null {
  const value = rawValue.trim();
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error('Reference limit must be a finite number or blank.');
  return parsed;
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

const COMPARATOR_PREFIX: Record<string, ValueComparator> = {
  '<=': 'lte',
  '>=': 'gte',
  '≤': 'lte',
  '≥': 'gte',
  '<': 'lt',
  '>': 'gt',
};

/** Parse user/OCR value text into rawValue + optional numeric magnitude + comparator. */
export function parseObservationValue(rawInput: string): {
  rawValue: string;
  value: number | null;
  comparator: ValueComparator;
} {
  const rawValue = rawInput.trim();
  if (!rawValue) throw new Error('Check value is required.');
  const match = rawValue.match(/^(<=|>=|≤|≥|<|>)\s*(.+)$/);
  if (match) {
    const comparator = COMPARATOR_PREFIX[match[1]!]!;
    const numeric = Number(match[2]!.trim().replace(',', '.'));
    return {
      rawValue,
      value: Number.isFinite(numeric) ? numeric : null,
      comparator,
    };
  }
  const numeric = Number(rawValue.replace(',', '.'));
  if (Number.isFinite(numeric)) {
    return { rawValue, value: numeric, comparator: 'none' };
  }
  // Qualitative / non-numeric — keep text, no fabricated number
  return { rawValue, value: null, comparator: 'none' };
}

function resolveLimits(
  fields: ManualObservationFields,
  indicator: Indicator,
  previous: Observation | null | undefined,
): { lowerLimit: number | null; upperLimit: number | null; rangeProvenance: RangeProvenance } {
  if (fields.lowerLimit !== undefined || fields.upperLimit !== undefined) {
    const lowerLimit = parseOptionalLimit(fields.lowerLimit ?? '');
    const upperLimit = parseOptionalLimit(fields.upperLimit ?? '');
    if (lowerLimit !== null && upperLimit !== null && lowerLimit > upperLimit) {
      throw new Error('Lower reference limit cannot exceed upper limit.');
    }
    const rangeProvenance = fields.rangeProvenance
      ?? ((lowerLimit === null && upperLimit === null) ? 'unknown' : 'from-report');
    if (lowerLimit === null && upperLimit === null && rangeProvenance !== 'unknown') {
      throw new Error('Absent reference ranges must use unknown provenance.');
    }
    return { lowerLimit, upperLimit, rangeProvenance };
  }
  if (previous) {
    return {
      lowerLimit: previous.lowerLimit,
      upperLimit: previous.upperLimit,
      rangeProvenance: previous.rangeProvenance,
    };
  }
  // New row: seed from indicator defaults only as user-confirmed starting values for *this* result.
  const lowerLimit = indicator.lowerLimit;
  const upperLimit = indicator.upperLimit;
  return {
    lowerLimit,
    upperLimit,
    rangeProvenance: (lowerLimit === null && upperLimit === null) ? 'unknown' : 'from-report',
  };
}

export function createManualObservation(
  indicator: Indicator,
  fields: ManualObservationFields,
  sourceId: string | null = null,
): Observation {
  if (!fields.id.trim()) throw new Error('Observation ID is required.');
  if (!isRealDate(fields.date)) throw new Error('Check date must be a real date in YYYY-MM-DD format.');
  const parsed = parseObservationValue(fields.value);
  const previous = fields.previous ?? null;
  const limits = resolveLimits(fields, indicator, previous);
  const laboratory = fields.laboratory !== undefined
    ? (fields.laboratory?.trim() || null)
    : (previous?.laboratory ?? null);
  const method = fields.method !== undefined
    ? (fields.method?.trim() || null)
    : (previous?.method ?? null);
  const specimen = fields.specimen !== undefined
    ? (fields.specimen?.trim() || null)
    : (previous?.specimen ?? null);

  return {
    id: fields.id,
    indicatorId: indicator.id,
    date: fields.date,
    rawValue: parsed.rawValue,
    value: parsed.value,
    comparator: parsed.comparator,
    unit: indicator.unit,
    lowerLimit: limits.lowerLimit,
    upperLimit: limits.upperLimit,
    rangeProvenance: limits.rangeProvenance,
    laboratory,
    method,
    specimen,
    sourceId,
    pageNumber: fields.pageNumber === undefined
      ? (previous?.pageNumber ?? null)
      : fields.pageNumber,
    confirmed: true,
  };
}
