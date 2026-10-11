import type { Indicator, Observation } from '../domain/types';

export interface ManualObservationFields {
  id: string;
  date: string;
  value: string;
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

export function createManualObservation(
  indicator: Indicator,
  fields: ManualObservationFields,
  sourceId: string | null = null,
): Observation {
  if (!fields.id.trim()) throw new Error('Observation ID is required.');
  if (!isRealDate(fields.date)) throw new Error('Check date must be a real date in YYYY-MM-DD format.');
  if (!fields.value.trim()) throw new Error('Check value is required.');
  const value = Number(fields.value);
  if (!Number.isFinite(value)) throw new Error('Check value must be a finite number.');
  return {
    id: fields.id,
    indicatorId: indicator.id,
    date: fields.date,
    value,
    unit: indicator.unit,
    sourceId,
    confirmed: true,
  };
}
