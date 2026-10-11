import type { Indicator, Medication, Observation } from '../domain/types';

export interface ReferenceRange {
  lower: number | null;
  upper: number | null;
}

export interface ChartPoint {
  date: string;
  value: number;
  sourceId: string | null;
  pageNumber: number | null;
}

export interface MedicationPeriod {
  id: string;
  nameZh: string;
  nameEn: string;
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
  referenceRange: ReferenceRange;
  points: ChartPoint[];
  medications: MedicationPeriod[];
}

export type ObservationClassification = 'low' | 'in-range' | 'high' | 'unknown';

export function classifyObservation(value: number, range: ReferenceRange): ObservationClassification {
  if (range.lower === null && range.upper === null) return 'unknown';
  if (range.lower !== null && value < range.lower) return 'low';
  if (range.upper !== null && value > range.upper) return 'high';
  return 'in-range';
}

export function buildSeries(indicator: Indicator, observations: Observation[], medications: Medication[] = []): ChartSeries[] {
  const rows = observations.filter((observation) => observation.indicatorId === indicator.id);
  const units = [...new Set(rows.map((observation) => observation.unit))];
  if (!units.length) units.push(indicator.unit);
  return units.sort((a, b) => a.localeCompare(b)).map((unit) => ({
    indicatorId: indicator.id,
    nameZh: indicator.nameZh,
    nameEn: indicator.nameEn,
    purposeZh: indicator.purposeZh,
    purposeEn: indicator.purposeEn,
    category: indicator.category,
    priority: indicator.priority,
    unit,
    referenceRange: unit === indicator.unit
      ? { lower: indicator.lowerLimit, upper: indicator.upperLimit }
      : { lower: null, upper: null },
    points: rows.filter((observation) => observation.unit === unit)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
      .map((observation) => ({
        date: observation.date,
        value: observation.value,
        sourceId: observation.sourceId,
        pageNumber: observation.pageNumber ?? null,
      })),
    medications: medications.filter((medication) => medication.linkedIndicatorIds.includes(indicator.id))
      .map((medication) => ({
        id: medication.id,
        nameZh: medication.nameZh,
        nameEn: medication.nameEn,
        strength: medication.strength,
        instructions: medication.instructions,
        startDate: medication.startDate,
        endDate: medication.endDate,
      })),
  }));
}
