import type {
  Indicator,
  Medication,
  MedicationRegimenStage,
  Observation,
  ValueComparator,
} from '../domain/types';
import { formatRegimenStageSummary } from '../import/medicationPackaging';

export interface ReferenceRange {
  lower: number | null;
  upper: number | null;
}

export interface ChartPoint {
  date: string;
  value: number | null;
  rawValue: string;
  comparator: ValueComparator;
  lowerLimit: number | null;
  upperLimit: number | null;
  rangeProvenance: Observation['rangeProvenance'];
  laboratory: string | null;
  method: string | null;
  sourceId: string | null;
  pageNumber: number | null;
}

/** Neutral dose-stage annotation for charts — never implies causation. */
export interface MedicationPeriod {
  id: string;
  medicationId: string;
  nameZh: string;
  nameEn: string;
  summary: string;
  strength: string;
  instructions: string;
  startDate: string | null;
  endDate: string | null;
}

export interface ChartSeries {
  indicatorId: string;
  nameZh: string;
  nameEn: string;
  purposeZh: string;
  purposeEn: string;
  category: string;
  priority: boolean;
  unit: string;
  /**
   * Unified dashed-line range for display only when every point shares identical limits.
   * Classification always uses each point's own limits — never indicator defaults.
   */
  referenceRange: ReferenceRange;
  points: ChartPoint[];
  medications: MedicationPeriod[];
}

export type ObservationClassification = 'low' | 'in-range' | 'high' | 'unknown';

/**
 * Classify using the observation's own limits + comparator.
 * Inequalities only flag abnormal when every possible actual value would be out of range;
 * they are never coerced into exact equality.
 */
export function classifyObservation(
  value: number | null,
  range: ReferenceRange,
  comparator: ValueComparator = 'none',
): ObservationClassification {
  if (value === null || (range.lower === null && range.upper === null)) return 'unknown';

  if (comparator === 'none') {
    if (range.lower !== null && value < range.lower) return 'low';
    if (range.upper !== null && value > range.upper) return 'high';
    return 'in-range';
  }

  if (comparator === 'lt' || comparator === 'lte') {
    if (range.lower !== null) {
      if (comparator === 'lt' && value <= range.lower) return 'low';
      if (comparator === 'lte' && value < range.lower) return 'low';
    }
    return 'unknown';
  }

  if (comparator === 'gt' || comparator === 'gte') {
    if (range.upper !== null) {
      if (comparator === 'gt' && value >= range.upper) return 'high';
      if (comparator === 'gte' && value > range.upper) return 'high';
    }
    return 'unknown';
  }

  return 'unknown';
}

function sharedReferenceRange(points: ChartPoint[]): ReferenceRange {
  if (!points.length) return { lower: null, upper: null };
  const first = points[0]!;
  const same = points.every(
    (point) => point.lowerLimit === first.lowerLimit && point.upperLimit === first.upperLimit,
  );
  return same ? { lower: first.lowerLimit, upper: first.upperLimit } : { lower: null, upper: null };
}

export function buildSeries(
  indicator: Indicator,
  observations: Observation[],
  medications: Medication[] = [],
  regimenStages: MedicationRegimenStage[] = [],
): ChartSeries[] {
  const rows = observations.filter((observation) => observation.indicatorId === indicator.id);
  const units = [...new Set(rows.map((observation) => observation.unit))];
  if (!units.length) units.push(indicator.unit);
  const linkedMeds = medications.filter((medication) => medication.linkedIndicatorIds.includes(indicator.id));
  const periods: MedicationPeriod[] = linkedMeds.flatMap((medication) => {
    const stages = regimenStages.filter((stage) => stage.medicationId === medication.id);
    if (!stages.length) {
      return [{
        id: `${medication.id}-none`,
        medicationId: medication.id,
        nameZh: medication.nameZh,
        nameEn: medication.nameEn,
        summary: '用药阶段未记录',
        strength: '',
        instructions: '',
        startDate: null,
        endDate: null,
      }];
    }
    return stages.map((stage) => ({
      id: stage.id,
      medicationId: medication.id,
      nameZh: medication.nameZh,
      nameEn: medication.nameEn,
      summary: formatRegimenStageSummary(stage),
      strength: stage.strengthLabel,
      instructions: stage.frequency,
      startDate: stage.startDate,
      endDate: stage.endDate,
    }));
  });

  return units.sort((a, b) => a.localeCompare(b)).map((unit) => {
    const points = rows.filter((observation) => observation.unit === unit)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
      .map((observation) => ({
        date: observation.date,
        value: observation.value,
        rawValue: observation.rawValue,
        comparator: observation.comparator,
        lowerLimit: observation.lowerLimit,
        upperLimit: observation.upperLimit,
        rangeProvenance: observation.rangeProvenance,
        laboratory: observation.laboratory,
        method: observation.method,
        sourceId: observation.sourceId,
        pageNumber: observation.pageNumber ?? null,
      }));
    return {
      indicatorId: indicator.id,
      nameZh: indicator.nameZh,
      nameEn: indicator.nameEn,
      purposeZh: indicator.purposeZh,
      purposeEn: indicator.purposeEn,
      category: indicator.category,
      priority: indicator.priority,
      unit,
      referenceRange: sharedReferenceRange(points),
      points,
      medications: periods,
    };
  });
}
