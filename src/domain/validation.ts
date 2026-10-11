import type { HealthRecord, Indicator, Medication, Observation, Source } from './types';

export class HealthRecordValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HealthRecordValidationError';
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new HealthRecordValidationError(message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isOptionalLimit(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function assertUniqueIds(records: Array<{ id: string }>): void {
  const ids = new Set<string>();
  for (const record of records) {
    assert(isText(record.id), 'Every record needs an ID.');
    assert(!ids.has(record.id), `Duplicate record ID: ${record.id}`);
    ids.add(record.id);
  }
}

function assertMedication(value: unknown): asserts value is Medication {
  assert(isObject(value), 'Invalid medication record.');
  assert(isText(value.id), 'Medication ID is required.');
  assert(isText(value.nameZh) && isText(value.nameEn), 'Medication names in Chinese and English are required.');
  assert(isText(value.strength) && isText(value.instructions), 'Medication strength and instructions are required.');
  assert(value.startDate === null || isIsoDate(value.startDate), 'Medication start date must be YYYY-MM-DD or blank.');
  assert(value.endDate === null || isIsoDate(value.endDate), 'Medication end date must be YYYY-MM-DD or blank.');
  assert(Array.isArray(value.linkedIndicatorIds) && value.linkedIndicatorIds.every(isText), 'Medication indicator links are invalid.');
}

function assertIndicator(value: unknown): asserts value is Indicator {
  assert(isObject(value), 'Invalid indicator record.');
  assert(isText(value.id), 'Indicator ID is required.');
  assert(isText(value.nameZh) && isText(value.nameEn), 'Indicator names in Chinese and English are required.');
  assert(isText(value.purposeZh) && isText(value.purposeEn), 'Indicator purposes in Chinese and English are required.');
  assert(isText(value.category) && isText(value.unit), 'Indicator category and unit are required.');
  assert(isOptionalLimit(value.lowerLimit) && isOptionalLimit(value.upperLimit), 'Reference limits must be numbers or blank.');
  assert(value.lowerLimit === null || value.upperLimit === null || value.lowerLimit <= value.upperLimit, 'Lower reference limit cannot exceed upper limit.');
  assert(typeof value.priority === 'boolean', 'Indicator priority must be confirmed.');
}

function assertObservation(value: unknown): asserts value is Observation {
  assert(isObject(value), 'Invalid observation record.');
  assert(isText(value.id) && isText(value.indicatorId), 'Observation and indicator IDs are required.');
  assert(isIsoDate(value.date), 'Observation date must be a real date in YYYY-MM-DD format.');
  assert(typeof value.value === 'number' && Number.isFinite(value.value), 'Observation value must be a finite number.');
  assert(isText(value.unit), 'Observation unit is required.');
  assert(value.sourceId === null || isText(value.sourceId), 'Observation source reference is invalid.');
  assert(value.confirmed === true, 'Only confirmed observations can be saved.');
}

function assertSource(value: unknown): asserts value is Source {
  assert(isObject(value), 'Invalid source record.');
  assert(isText(value.id) && isText(value.fileName), 'Source ID and filename are required.');
  assert(value.type === 'image' || value.type === 'pdf' || value.type === 'manual', 'Source type is invalid.');
  assert(typeof value.importedAt === 'string' && Number.isFinite(Date.parse(value.importedAt)), 'Source import time is invalid.');
  assert(value.pageCount === null || (Number.isInteger(value.pageCount) && Number(value.pageCount) > 0), 'Source page count is invalid.');
}

export function validateHealthRecord(record: unknown): HealthRecord {
  assert(isObject(record), 'Health record must be an object.');
  assert(record.schemaVersion === 1, 'Unsupported health record version.');
  assert(Array.isArray(record.medications) && Array.isArray(record.indicators) && Array.isArray(record.observations) && Array.isArray(record.sources), 'Health record collections are invalid.');

  const medications = record.medications as unknown[];
  const indicators = record.indicators as unknown[];
  const observations = record.observations as unknown[];
  const sources = record.sources as unknown[];
  medications.forEach(assertMedication);
  indicators.forEach(assertIndicator);
  observations.forEach(assertObservation);
  sources.forEach(assertSource);

  const allIds = [...medications, ...indicators, ...observations, ...sources] as Array<{ id: string }>;
  assertUniqueIds(allIds);

  const validatedMedications = medications as Medication[];
  const validatedIndicators = indicators as Indicator[];
  const validatedObservations = observations as Observation[];
  const validatedSources = sources as Source[];
  const indicatorMap = new Map(validatedIndicators.map((indicator) => [indicator.id, indicator]));
  const sourceIds = new Set(validatedSources.map((source) => source.id));
  for (const medication of validatedMedications) {
    assert(medication.linkedIndicatorIds.every((id) => indicatorMap.has(id)), `Medication ${medication.id} references an unknown indicator.`);
  }
  for (const observation of validatedObservations) {
    const indicator = indicatorMap.get(observation.indicatorId);
    assert(indicator, `Observation ${observation.id} references an unknown indicator.`);
    assert(indicator.unit === observation.unit, `Observation ${observation.id} unit does not match its indicator.`);
    assert(observation.sourceId === null || sourceIds.has(observation.sourceId), `Observation ${observation.id} references an unknown source.`);
  }

  return record as unknown as HealthRecord;
}
