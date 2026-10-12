import type {
  HealthRecord,
  Indicator,
  Medication,
  MedicationRegimenStage,
  Observation,
  Profile,
  RangeProvenance,
  ReportTextBlock,
  AppleHealthRecord,
  ValueComparator,
} from './types';
import { emptyProfile } from './types';
import { HealthRecordValidationError } from './validation';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function asOptionalText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  return null;
}

function migrateProfile(raw: unknown): Profile {
  if (!isObject(raw)) return emptyProfile();
  const displayName = typeof raw.displayName === 'string' ? raw.displayName.trim() : '';
  return {
    displayName,
    identityConfirmed: raw.identityConfirmed === true && displayName.length > 0,
  };
}

function migrateObservation(raw: Record<string, unknown>, indicator: Indicator | undefined): Observation {
  const unit = typeof raw.unit === 'string' && raw.unit.trim() ? raw.unit.trim() : indicator?.unit ?? '';
  const numeric = typeof raw.value === 'number' && Number.isFinite(raw.value) ? raw.value : null;
  const rawValue = typeof raw.rawValue === 'string' && raw.rawValue.trim()
    ? raw.rawValue.trim()
    : numeric === null ? '' : String(numeric);

  let lowerLimit = asOptionalNumber(raw.lowerLimit);
  let upperLimit = asOptionalNumber(raw.upperLimit);
  let rangeProvenance: RangeProvenance = 'unknown';

  const hasOwnLimits = Object.prototype.hasOwnProperty.call(raw, 'lowerLimit')
    || Object.prototype.hasOwnProperty.call(raw, 'upperLimit')
    || Object.prototype.hasOwnProperty.call(raw, 'rangeProvenance');

  if (hasOwnLimits && typeof raw.rangeProvenance === 'string'
    && (raw.rangeProvenance === 'from-report' || raw.rangeProvenance === 'migrated-unverified' || raw.rangeProvenance === 'unknown')) {
    rangeProvenance = raw.rangeProvenance;
  } else if (!hasOwnLimits && indicator && unit === indicator.unit) {
    lowerLimit = indicator.lowerLimit;
    upperLimit = indicator.upperLimit;
    rangeProvenance = (lowerLimit === null && upperLimit === null) ? 'unknown' : 'migrated-unverified';
  } else if (lowerLimit !== null || upperLimit !== null) {
    rangeProvenance = typeof raw.rangeProvenance === 'string'
      && (raw.rangeProvenance === 'from-report' || raw.rangeProvenance === 'migrated-unverified' || raw.rangeProvenance === 'unknown')
      ? raw.rangeProvenance
      : 'migrated-unverified';
  }

  const comparator: ValueComparator = raw.comparator === 'lt' || raw.comparator === 'gt'
    || raw.comparator === 'lte' || raw.comparator === 'gte' || raw.comparator === 'none'
    ? raw.comparator
    : 'none';

  return {
    id: String(raw.id ?? ''),
    indicatorId: String(raw.indicatorId ?? ''),
    date: String(raw.date ?? ''),
    rawValue,
    value: numeric,
    comparator,
    unit,
    lowerLimit,
    upperLimit,
    rangeProvenance,
    laboratory: asOptionalText(raw.laboratory),
    method: asOptionalText(raw.method),
    specimen: asOptionalText(raw.specimen),
    sourceId: raw.sourceId === null || raw.sourceId === undefined ? null : String(raw.sourceId),
    pageNumber: raw.pageNumber === undefined || raw.pageNumber === null
      ? null
      : Number(raw.pageNumber),
    confirmed: true,
  };
}

function migrateMedicationsAndStages(raw: Record<string, unknown>): {
  medications: Medication[];
  regimenStages: MedicationRegimenStage[];
} {
  const medicationsRaw = Array.isArray(raw.medications) ? raw.medications : [];
  const stagesRaw = Array.isArray(raw.regimenStages) ? raw.regimenStages : [];
  const medications: Medication[] = [];
  const regimenStages: MedicationRegimenStage[] = [];

  for (const item of medicationsRaw) {
    if (!isObject(item) || typeof item.id !== 'string') continue;
    const linked = Array.isArray(item.linkedIndicatorIds)
      ? item.linkedIndicatorIds.filter((id): id is string => typeof id === 'string')
      : [];
    medications.push({
      id: item.id,
      nameZh: String(item.nameZh ?? ''),
      nameEn: String(item.nameEn ?? ''),
      linkedIndicatorIds: linked,
      monitoringNote: asOptionalText(item.monitoringNote),
    });

    // Legacy v1/v2 medication carried a single strength/instructions/date triple.
    const hasLegacyDose = typeof item.strength === 'string' || typeof item.instructions === 'string'
      || item.startDate !== undefined || item.endDate !== undefined;
    const alreadyHasStages = stagesRaw.some((stage) => isObject(stage) && stage.medicationId === item.id);
    if (hasLegacyDose && !alreadyHasStages) {
      regimenStages.push({
        id: `${item.id}-migrated-stage`,
        medicationId: item.id,
        strengthLabel: typeof item.strength === 'string' && item.strength.trim() ? item.strength.trim() : '未记录规格',
        doseAmount: null,
        doseUnit: null,
        frequency: typeof item.instructions === 'string' && item.instructions.trim() ? item.instructions.trim() : '未记录用法',
        form: null,
        packCountLabel: null,
        startDate: item.startDate === null || item.startDate === undefined ? null : String(item.startDate),
        endDate: item.endDate === null || item.endDate === undefined ? null : String(item.endDate),
      });
    }
  }

  for (const item of stagesRaw) {
    if (!isObject(item) || typeof item.id !== 'string') continue;
    regimenStages.push({
      id: item.id,
      medicationId: String(item.medicationId ?? ''),
      strengthLabel: String(item.strengthLabel ?? ''),
      doseAmount: asOptionalText(item.doseAmount),
      doseUnit: asOptionalText(item.doseUnit),
      frequency: String(item.frequency ?? ''),
      form: asOptionalText(item.form),
      packCountLabel: asOptionalText(item.packCountLabel),
      startDate: item.startDate === null || item.startDate === undefined ? null : String(item.startDate),
      endDate: item.endDate === null || item.endDate === undefined ? null : String(item.endDate),
    });
  }

  return { medications, regimenStages };
}

function migrateReportTextBlocks(raw: unknown): ReportTextBlock[] {
  if (!Array.isArray(raw)) return [];
  const blocks: ReportTextBlock[] = [];
  for (const item of raw) {
    if (!isObject(item) || typeof item.id !== 'string') continue;
    const sectionKind = item.sectionKind === 'findings' || item.sectionKind === 'conclusion'
      || item.sectionKind === 'advice' || item.sectionKind === 'other'
      ? item.sectionKind
      : 'other';
    const kind = item.kind === 'user-note' ? 'user-note' : 'verbatim';
    blocks.push({
      id: item.id,
      sourceId: item.sourceId === null || item.sourceId === undefined ? null : String(item.sourceId),
      reportName: String(item.reportName ?? ''),
      reportDate: item.reportDate === null || item.reportDate === undefined ? null : String(item.reportDate),
      laboratory: asOptionalText(item.laboratory),
      pageNumber: item.pageNumber === undefined || item.pageNumber === null ? null : Number(item.pageNumber),
      sectionTitle: String(item.sectionTitle ?? ''),
      sectionKind,
      body: String(item.body ?? ''),
      kind,
      contentFingerprint: String(item.contentFingerprint ?? ''),
      confirmed: true,
    });
  }
  return blocks;
}

/**
 * Normalize any supported on-disk / backup payload to schema v4.
 * Does not write storage. Callers must validate the result and only then persist.
 */
export function migrateHealthRecord(raw: unknown): HealthRecord {
  if (!isObject(raw)) throw new HealthRecordValidationError('Health record must be an object.');
  const version = raw.schemaVersion;
  if (version !== 1 && version !== 2 && version !== 3 && version !== 4) {
    throw new HealthRecordValidationError('Unsupported health record version.');
  }

  const indicators = Array.isArray(raw.indicators) ? raw.indicators : [];
  const indicatorMap = new Map<string, Indicator>();
  for (const item of indicators) {
    if (!isObject(item) || typeof item.id !== 'string') continue;
    indicatorMap.set(item.id, {
      id: item.id,
      nameZh: String(item.nameZh ?? ''),
      nameEn: String(item.nameEn ?? ''),
      purposeZh: String(item.purposeZh ?? ''),
      purposeEn: String(item.purposeEn ?? ''),
      category: String(item.category ?? ''),
      unit: String(item.unit ?? ''),
      lowerLimit: asOptionalNumber(item.lowerLimit),
      upperLimit: asOptionalNumber(item.upperLimit),
      priority: item.priority === true,
    });
  }

  const observationsRaw = Array.isArray(raw.observations) ? raw.observations : [];
  const observations: Observation[] = observationsRaw.map((item) => {
    if (!isObject(item)) {
      throw new HealthRecordValidationError('Invalid observation record during migration.');
    }
    const indicator = typeof item.indicatorId === 'string' ? indicatorMap.get(item.indicatorId) : undefined;
    return migrateObservation(item, indicator);
  });

  const { medications, regimenStages } = migrateMedicationsAndStages(raw);

  return {
    schemaVersion: 4,
    profile: migrateProfile(raw.profile),
    medications,
    regimenStages,
    indicators: Array.isArray(raw.indicators) ? raw.indicators as HealthRecord['indicators'] : [],
    observations,
    reportTextBlocks: migrateReportTextBlocks(raw.reportTextBlocks),
    appleHealthRecords: migrateAppleHealthRecords(raw.appleHealthRecords),
    sources: Array.isArray(raw.sources) ? raw.sources as HealthRecord['sources'] : [],
  };
}

function migrateAppleHealthRecords(raw: unknown): AppleHealthRecord[] {
  if (!Array.isArray(raw)) return [];
  const rows: AppleHealthRecord[] = [];
  for (const item of raw) {
    if (!isObject(item) || typeof item.id !== 'string') continue;
    const kind = item.kind === 'workout' || item.kind === 'activitySummary' || item.kind === 'sample'
      ? item.kind
      : 'sample';
    rows.push({
      id: item.id,
      kind,
      typeIdentifier: String(item.typeIdentifier ?? ''),
      value: asOptionalNumber(item.value),
      unit: asOptionalText(item.unit),
      startAt: String(item.startAt ?? ''),
      endAt: item.endAt === null || item.endAt === undefined ? null : String(item.endAt),
      localDate: String(item.localDate ?? ''),
      sourceName: asOptionalText(item.sourceName),
      sourceBundleOrDevice: asOptionalText(item.sourceBundleOrDevice),
      workoutActivityType: asOptionalText(item.workoutActivityType),
      duration: asOptionalNumber(item.duration),
      durationUnit: asOptionalText(item.durationUnit),
      importFingerprint: String(item.importFingerprint ?? ''),
      sourceFileId: String(item.sourceFileId ?? ''),
      importedAt: String(item.importedAt ?? ''),
      confirmed: true,
    });
  }
  return rows;
}


/** True when the payload still needs a rewrite to current schema on disk. */
export function needsSchemaRewrite(raw: unknown): boolean {
  return isObject(raw) && raw.schemaVersion !== 4;
}

/**
 * Returns true when an OCR-extracted person-name hint disagrees with the confirmed profile.
 * Never auto-files; callers must prompt the user.
 */
export function profileNameMismatch(ocrNameHint: string | null | undefined, profile: Profile): boolean {
  if (!ocrNameHint || !ocrNameHint.trim()) return false;
  if (!profile.identityConfirmed || !profile.displayName.trim()) return false;
  const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '');
  return normalize(ocrNameHint) !== normalize(profile.displayName);
}
