export type SchemaVersion = 1 | 2 | 3 | 4;

/** How a numeric reading relates to `value` (the reported bound). */
export type ValueComparator = 'none' | 'lt' | 'gt' | 'lte' | 'gte';

/**
 * Where observation reference limits came from.
 * - from-report: user confirmed limits from that observation's report
 * - migrated-unverified: copied from legacy indicator-level limits; not claimed as original report ranges
 * - unknown: limits absent or provenance cannot be established
 */
export type RangeProvenance = 'from-report' | 'migrated-unverified' | 'unknown';

export type ReportTextKind = 'verbatim' | 'user-note';
export type ReportTextSection = 'findings' | 'conclusion' | 'advice' | 'other';

export type AppleHealthKind = 'sample' | 'workout' | 'activitySummary';

export interface Profile {
  displayName: string;
  identityConfirmed: boolean;
}

export interface HealthRecord {
  schemaVersion: 4;
  profile: Profile;
  medications: Medication[];
  regimenStages: MedicationRegimenStage[];
  indicators: Indicator[];
  observations: Observation[];
  reportTextBlocks: ReportTextBlock[];
  /** Confirmed Apple Health / Fitness export rows (separate from lab observations). */
  appleHealthRecords: AppleHealthRecord[];
  sources: Source[];
}

export interface Medication {
  id: string;
  nameZh: string;
  nameEn: string;
  linkedIndicatorIds: string[];
  /** Codex/label monitoring text when no HR/BP (etc.) indicator exists to link. */
  monitoringNote: string | null;
}

export interface MedicationRegimenStage {
  id: string;
  medicationId: string;
  strengthLabel: string;
  doseAmount: string | null;
  doseUnit: string | null;
  frequency: string;
  form: string | null;
  packCountLabel: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface Indicator {
  id: string;
  nameZh: string;
  nameEn: string;
  purposeZh: string;
  purposeEn: string;
  category: string;
  unit: string;
  lowerLimit: number | null;
  upperLimit: number | null;
  priority: boolean;
}

export interface Observation {
  id: string;
  indicatorId: string;
  date: string;
  rawValue: string;
  value: number | null;
  comparator: ValueComparator;
  unit: string;
  lowerLimit: number | null;
  upperLimit: number | null;
  rangeProvenance: RangeProvenance;
  laboratory: string | null;
  method: string | null;
  specimen: string | null;
  sourceId: string | null;
  pageNumber: number | null;
  confirmed: true;
}

export interface ReportTextBlock {
  id: string;
  sourceId: string | null;
  reportName: string;
  reportDate: string | null;
  laboratory: string | null;
  pageNumber: number | null;
  sectionTitle: string;
  sectionKind: ReportTextSection;
  body: string;
  kind: ReportTextKind;
  contentFingerprint: string;
  confirmed: true;
}

/**
 * One confirmed Apple Health export row.
 * Never merged into lab Observation series with incompatible units.
 */
export interface AppleHealthRecord {
  id: string;
  kind: AppleHealthKind;
  typeIdentifier: string;
  value: number | null;
  unit: string | null;
  /** Original timestamp text including offset, e.g. 2024-01-01 08:00:00 +0800 */
  startAt: string;
  endAt: string | null;
  /** Calendar date from startAt offset (YYYY-MM-DD), not UTC-shifted. */
  localDate: string;
  sourceName: string | null;
  sourceBundleOrDevice: string | null;
  workoutActivityType: string | null;
  duration: number | null;
  durationUnit: string | null;
  importFingerprint: string;
  sourceFileId: string;
  importedAt: string;
  confirmed: true;
}

export interface Source {
  id: string;
  fileName: string;
  type: 'image' | 'pdf' | 'manual' | 'apple-health';
  importedAt: string;
  pageCount: number | null;
}

export function emptyProfile(): Profile {
  return { displayName: '', identityConfirmed: false };
}

export function emptyHealthRecord(): HealthRecord {
  return {
    schemaVersion: 4,
    profile: emptyProfile(),
    medications: [],
    regimenStages: [],
    indicators: [],
    observations: [],
    reportTextBlocks: [],
    appleHealthRecords: [],
    sources: [],
  };
}
