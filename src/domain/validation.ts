import type {
  HealthRecord,
  Indicator,
  Medication,
  MedicationRegimenStage,
  Observation,
  Profile,
  RangeProvenance,
  ReportTextBlock,
  ReportTextKind,
  ReportTextSection,
  AppleHealthRecord,
  AppleHealthKind,
  Source,
  ValueComparator,
} from './types';

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

function isComparator(value: unknown): value is ValueComparator {
  return value === 'none' || value === 'lt' || value === 'gt' || value === 'lte' || value === 'gte';
}

function isRangeProvenance(value: unknown): value is RangeProvenance {
  return value === 'from-report' || value === 'migrated-unverified' || value === 'unknown';
}

function isReportTextKind(value: unknown): value is ReportTextKind {
  return value === 'verbatim' || value === 'user-note';
}

function isReportTextSection(value: unknown): value is ReportTextSection {
  return value === 'findings' || value === 'conclusion' || value === 'advice' || value === 'other';
}

function assertUniqueIds(records: Array<{ id: string }>): void {
  const ids = new Set<string>();
  for (const record of records) {
    assert(isText(record.id), 'Every record needs an ID.');
    assert(!ids.has(record.id), `Duplicate record ID: ${record.id}`);
    ids.add(record.id);
  }
}

function assertProfile(value: unknown): asserts value is Profile {
  assert(isObject(value), 'Profile is required.');
  assert(typeof value.displayName === 'string', 'Profile display name must be a string.');
  assert(typeof value.identityConfirmed === 'boolean', 'Profile confirmation flag is required.');
  if (value.identityConfirmed) {
    assert(value.displayName.trim().length > 0, 'Confirmed profile needs a display name.');
  }
}

function assertMedication(value: unknown): asserts value is Medication {
  assert(isObject(value), 'Invalid medication record.');
  assert(isText(value.id), 'Medication ID is required.');
  assert(isText(value.nameZh) && isText(value.nameEn), 'Medication names in Chinese and English are required.');
  assert(Array.isArray(value.linkedIndicatorIds) && value.linkedIndicatorIds.every(isText), 'Medication indicator links are invalid.');
  assert(
    value.monitoringNote === null || typeof value.monitoringNote === 'string',
    'Medication monitoringNote must be text or null.',
  );
}

export function assertRegimenStageDates(startDate: string | null, endDate: string | null): void {
  assert(startDate === null || isIsoDate(startDate), 'Regimen start date must be YYYY-MM-DD or unknown.');
  assert(endDate === null || isIsoDate(endDate), 'Regimen end date must be YYYY-MM-DD or unknown.');
  if (startDate && endDate) {
    assert(startDate <= endDate, 'Regimen end date cannot be earlier than start date.');
  }
}

function assertRegimenStage(value: unknown): asserts value is MedicationRegimenStage {
  assert(isObject(value), 'Invalid medication regimen stage.');
  assert(isText(value.id) && isText(value.medicationId), 'Regimen stage and medication IDs are required.');
  assert(isText(value.strengthLabel), 'Regimen strength label is required.');
  assert(value.doseAmount === null || typeof value.doseAmount === 'string', 'Regimen dose amount is invalid.');
  assert(value.doseUnit === null || typeof value.doseUnit === 'string', 'Regimen dose unit is invalid.');
  assert(isText(value.frequency), 'Regimen frequency is required.');
  assert(value.form === null || typeof value.form === 'string', 'Regimen form is invalid.');
  assert(value.packCountLabel === null || typeof value.packCountLabel === 'string', 'Regimen pack count label is invalid.');
  assertRegimenStageDates(
    value.startDate === null ? null : String(value.startDate),
    value.endDate === null ? null : String(value.endDate),
  );
  assert(value.startDate === null || isIsoDate(value.startDate), 'Regimen start date must be YYYY-MM-DD or unknown.');
  assert(value.endDate === null || isIsoDate(value.endDate), 'Regimen end date must be YYYY-MM-DD or unknown.');
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
  assert(typeof value.rawValue === 'string' && value.rawValue.trim().length > 0, 'Observation raw value text is required.');
  assert(
    value.value === null || (typeof value.value === 'number' && Number.isFinite(value.value)),
    'Observation numeric value must be finite or blank for qualitative results.',
  );
  assert(isComparator(value.comparator), 'Observation comparator is invalid.');
  assert(isText(value.unit), 'Observation unit is required.');
  assert(isOptionalLimit(value.lowerLimit) && isOptionalLimit(value.upperLimit), 'Observation reference limits must be numbers or blank.');
  assert(
    value.lowerLimit === null || value.upperLimit === null || value.lowerLimit <= value.upperLimit,
    'Observation lower reference limit cannot exceed upper limit.',
  );
  assert(isRangeProvenance(value.rangeProvenance), 'Observation range provenance is invalid.');
  if (value.lowerLimit === null && value.upperLimit === null) {
    assert(value.rangeProvenance === 'unknown', 'Absent observation ranges must use unknown provenance.');
  }
  assert(value.laboratory === null || isText(value.laboratory), 'Observation laboratory is invalid.');
  assert(value.method === null || isText(value.method), 'Observation method is invalid.');
  assert(value.specimen === null || isText(value.specimen), 'Observation specimen is invalid.');
  assert(value.sourceId === null || isText(value.sourceId), 'Observation source reference is invalid.');
  assert(
    value.pageNumber === null || (Number.isInteger(value.pageNumber) && Number(value.pageNumber) > 0),
    'Observation source page must be a positive integer or blank.',
  );
  assert(value.confirmed === true, 'Only confirmed observations can be saved.');
}

function assertReportTextBlock(value: unknown): asserts value is ReportTextBlock {
  assert(isObject(value), 'Invalid report text block.');
  assert(isText(value.id), 'Report text block ID is required.');
  assert(value.sourceId === null || isText(value.sourceId), 'Report text source reference is invalid.');
  assert(isText(value.reportName), 'Report name is required.');
  assert(value.reportDate === null || isIsoDate(value.reportDate), 'Report date must be YYYY-MM-DD or blank.');
  assert(value.laboratory === null || isText(value.laboratory), 'Report laboratory is invalid.');
  assert(
    value.pageNumber === null || (Number.isInteger(value.pageNumber) && Number(value.pageNumber) > 0),
    'Report text page must be a positive integer or blank.',
  );
  assert(isText(value.sectionTitle), 'Report text section title is required.');
  assert(isReportTextSection(value.sectionKind), 'Report text section kind is invalid.');
  assert(typeof value.body === 'string' && value.body.trim().length > 0, 'Report text body is required.');
  assert(isReportTextKind(value.kind), 'Report text kind is invalid.');
  assert(isText(value.contentFingerprint), 'Report text fingerprint is required.');
  assert(value.confirmed === true, 'Only confirmed report text can be saved.');
}


function isAppleKind(value: unknown): value is AppleHealthKind {
  return value === 'sample' || value === 'workout' || value === 'activitySummary';
}

function assertAppleHealthRecord(value: unknown): asserts value is AppleHealthRecord {
  assert(isObject(value), 'Invalid Apple Health record.');
  assert(isText(value.id), 'Apple Health record ID is required.');
  assert(isAppleKind(value.kind), 'Apple Health kind is invalid.');
  assert(isText(value.typeIdentifier), 'Apple Health type identifier is required.');
  assert(value.value === null || (typeof value.value === 'number' && Number.isFinite(value.value)), 'Apple Health value must be finite or blank.');
  assert(value.unit === null || typeof value.unit === 'string', 'Apple Health unit is invalid.');
  assert(isText(value.startAt), 'Apple Health startAt is required.');
  assert(value.endAt === null || typeof value.endAt === 'string', 'Apple Health endAt is invalid.');
  assert(typeof value.localDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.localDate), 'Apple Health localDate must be YYYY-MM-DD.');
  assert(value.sourceName === null || typeof value.sourceName === 'string', 'Apple Health sourceName is invalid.');
  assert(value.sourceBundleOrDevice === null || typeof value.sourceBundleOrDevice === 'string', 'Apple Health device is invalid.');
  assert(value.workoutActivityType === null || typeof value.workoutActivityType === 'string', 'Workout activity type is invalid.');
  assert(value.duration === null || (typeof value.duration === 'number' && Number.isFinite(value.duration)), 'Workout duration is invalid.');
  assert(value.durationUnit === null || typeof value.durationUnit === 'string', 'Workout duration unit is invalid.');
  assert(isText(value.importFingerprint), 'Apple Health fingerprint is required.');
  assert(isText(value.sourceFileId), 'Apple Health sourceFileId is required.');
  assert(typeof value.importedAt === 'string' && Number.isFinite(Date.parse(value.importedAt)), 'Apple Health importedAt is invalid.');
  assert(value.confirmed === true, 'Only confirmed Apple Health rows can be saved.');
}

function assertSource(value: unknown): asserts value is Source {
  assert(isObject(value), 'Invalid source record.');
  assert(isText(value.id) && isText(value.fileName), 'Source ID and filename are required.');
  assert(value.type === 'image' || value.type === 'pdf' || value.type === 'manual' || value.type === 'apple-health', 'Source type is invalid.');
  assert(typeof value.importedAt === 'string' && Number.isFinite(Date.parse(value.importedAt)), 'Source import time is invalid.');
  assert(value.pageCount === null || (Number.isInteger(value.pageCount) && Number(value.pageCount) > 0), 'Source page count is invalid.');
}

/** Validates a schema v4 health record. Call migrateHealthRecord first for legacy payloads. */
export function validateHealthRecord(record: unknown): HealthRecord {
  assert(isObject(record), 'Health record must be an object.');
  assert(record.schemaVersion === 4, 'Unsupported health record version.');
  assertProfile(record.profile);
  assert(
    record.updatedAt === undefined
      || (typeof record.updatedAt === 'string' && Number.isFinite(Date.parse(record.updatedAt))),
    'Health record updatedAt is invalid.',
  );
  assert(
    Array.isArray(record.medications)
      && Array.isArray(record.regimenStages)
      && Array.isArray(record.indicators)
      && Array.isArray(record.observations)
      && Array.isArray(record.reportTextBlocks)
      && Array.isArray(record.appleHealthRecords)
      && Array.isArray(record.sources),
    'Health record collections are invalid.',
  );

  const medications = record.medications as unknown[];
  const regimenStages = record.regimenStages as unknown[];
  const indicators = record.indicators as unknown[];
  const observations = record.observations as unknown[];
  const reportTextBlocks = record.reportTextBlocks as unknown[];
  const appleHealthRecords = record.appleHealthRecords as unknown[];
  const sources = record.sources as unknown[];
  medications.forEach(assertMedication);
  regimenStages.forEach(assertRegimenStage);
  indicators.forEach(assertIndicator);
  observations.forEach(assertObservation);
  reportTextBlocks.forEach(assertReportTextBlock);
  appleHealthRecords.forEach(assertAppleHealthRecord);
  sources.forEach(assertSource);

  const allIds = [...medications, ...regimenStages, ...indicators, ...observations, ...reportTextBlocks, ...appleHealthRecords, ...sources] as Array<{ id: string }>;
  assertUniqueIds(allIds);

  const validatedMedications = medications as Medication[];
  const validatedStages = regimenStages as MedicationRegimenStage[];
  const validatedIndicators = indicators as Indicator[];
  const validatedObservations = observations as Observation[];
  const validatedBlocks = reportTextBlocks as ReportTextBlock[];
  const validatedApple = appleHealthRecords as AppleHealthRecord[];
  const validatedSources = sources as Source[];
  const indicatorMap = new Map(validatedIndicators.map((indicator) => [indicator.id, indicator]));
  const medicationIds = new Set(validatedMedications.map((medication) => medication.id));
  const sourceIds = new Set(validatedSources.map((source) => source.id));
  for (const medication of validatedMedications) {
    assert(medication.linkedIndicatorIds.every((id) => indicatorMap.has(id)), `Medication ${medication.id} references an unknown indicator.`);
  }
  for (const stage of validatedStages) {
    assert(medicationIds.has(stage.medicationId), `Regimen stage ${stage.id} references an unknown medication.`);
  }
  for (const observation of validatedObservations) {
    const indicator = indicatorMap.get(observation.indicatorId);
    assert(indicator, `Observation ${observation.id} references an unknown indicator.`);
    assert(indicator.unit === observation.unit, `Observation ${observation.id} unit does not match its indicator.`);
    assert(observation.sourceId === null || sourceIds.has(observation.sourceId), `Observation ${observation.id} references an unknown source.`);
  }
  for (const block of validatedBlocks) {
    assert(block.sourceId === null || sourceIds.has(block.sourceId), `Report text ${block.id} references an unknown source.`);
  }
  for (const row of validatedApple) {
    assert(sourceIds.has(row.sourceFileId), `Apple Health row ${row.id} references an unknown source.`);
  }

  return record as unknown as HealthRecord;
}
