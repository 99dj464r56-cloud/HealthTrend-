import type { AppleHealthRecord, HealthRecord, Medication, MedicationRegimenStage, Observation, ReportTextBlock, Source } from '../domain/types';
import { categoryForAppleType, SUPPORTED_TYPE_LABELS_ZH } from '../import/appleHealth/supported';
import {
  REPORT_DATA_SCHEMA_VERSION,
  REPORT_REVISION_NOTES,
  REPORT_TEMPLATE_ID,
  REPORT_TEMPLATE_VERSION,
} from './reportMeta';
import { buildSeries, type ChartSeries } from '../charts/series';
import { formatRegimenStageSummary } from '../import/medicationPackaging';

export interface ReportCategory {
  category: string;
  series: ChartSeries[];
}

export interface ReportMedicationRow {
  medication: Medication;
  stages: MedicationRegimenStage[];
}

export interface ReportTextSectionModel {
  sectionKind: ReportTextBlock['sectionKind'];
  title: string;
  blocks: ReportTextBlock[];
  truncated: boolean;
}

export interface AppleHealthReportGroup {
  category: string;
  rows: AppleHealthRecord[];
}

export interface ProvenanceObservationRow {
  indicatorNameZh: string;
  indicatorNameEn: string;
  date: string;
  sourceFileName: string | null;
  pageNumber: number | null;
  confirmed: boolean;
  rangeProvenance: Observation['rangeProvenance'];
  laboratory: string | null;
}

export interface ProvenanceAppendix {
  templateId: string;
  templateVersion: string;
  schemaVersion: number;
  generatedAt: string;
  sources: Source[];
  observations: ProvenanceObservationRow[];
  reportTextCount: number;
  appleHealthCount: number;
  /** Always false in this release — originals are not retained by default. */
  originalFilesRetained: false;
  revisionNotes: string[];
}

export interface ReportModel {
  title: string;
  createdDate: string;
  profileDisplayName: string;
  medications: ReportMedicationRow[];
  reportTextSections: ReportTextSectionModel[];
  appleHealthGroups: AppleHealthReportGroup[];
  priorityIndicators: ChartSeries[];
  categories: ReportCategory[];
  provenance: ProvenanceAppendix;
}

const BODY_SOFT_LIMIT = 1200;

function localDate(date: Date): string {
  const part = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}`;
}

const SECTION_ORDER: ReportTextBlock['sectionKind'][] = ['findings', 'conclusion', 'advice', 'other'];

function sectionHeading(kind: ReportTextBlock['sectionKind'], fallback: string): string {
  if (kind === 'findings') return fallback || '检查所见 / Findings';
  if (kind === 'conclusion') return fallback || '结论 / Conclusion';
  if (kind === 'advice') return fallback || '报告建议 / Report advice';
  return fallback || '其他文字 / Other';
}


function buildProvenance(record: HealthRecord, createdDate: string): ProvenanceAppendix {
  const sourceMap = new Map(record.sources.map((source) => [source.id, source]));
  const indicatorMap = new Map(record.indicators.map((indicator) => [indicator.id, indicator]));
  const observations: ProvenanceObservationRow[] = [...record.observations]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((observation) => {
      const indicator = indicatorMap.get(observation.indicatorId);
      const source = observation.sourceId ? sourceMap.get(observation.sourceId) : undefined;
      return {
        indicatorNameZh: indicator?.nameZh ?? observation.indicatorId,
        indicatorNameEn: indicator?.nameEn ?? '',
        date: observation.date,
        sourceFileName: source?.fileName ?? null,
        pageNumber: observation.pageNumber,
        confirmed: observation.confirmed === true,
        rangeProvenance: observation.rangeProvenance,
        laboratory: observation.laboratory,
      };
    });
  return {
    templateId: REPORT_TEMPLATE_ID,
    templateVersion: REPORT_TEMPLATE_VERSION,
    schemaVersion: REPORT_DATA_SCHEMA_VERSION,
    generatedAt: createdDate,
    sources: [...record.sources],
    observations,
    reportTextCount: record.reportTextBlocks.filter((block) => block.confirmed).length,
    appleHealthCount: record.appleHealthRecords.length,
    originalFilesRetained: false,
    revisionNotes: [...REPORT_REVISION_NOTES],
  };
}

export function buildReportModel(record: HealthRecord, now = new Date()): ReportModel {
  const allSeries = record.indicators.flatMap((indicator) =>
    buildSeries(indicator, record.observations, record.medications, record.regimenStages));
  const categories = [...new Set(allSeries.map((series) => series.category))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
    .map((category) => ({
      category,
      series: allSeries.filter((series) => series.category === category),
    }));

  const medications = record.medications.map((medication) => ({
    medication,
    stages: record.regimenStages.filter((stage) => stage.medicationId === medication.id),
  }));

  const appleHealthGroups = [...record.appleHealthRecords]
    .sort((a, b) => a.localDate.localeCompare(b.localDate) || a.typeIdentifier.localeCompare(b.typeIdentifier))
    .reduce<AppleHealthReportGroup[]>((groups, row) => {
      const category = categoryForAppleType(row.typeIdentifier, row.kind);
      const existing = groups.find((group) => group.category === category);
      if (existing) existing.rows.push(row);
      else groups.push({ category, rows: [row] });
      return groups;
    }, []);

  const confirmedBlocks = record.reportTextBlocks.filter((block) => block.confirmed);
  const reportTextSections: ReportTextSectionModel[] = SECTION_ORDER
    .map((sectionKind) => {
      const blocks = confirmedBlocks.filter((block) => block.sectionKind === sectionKind);
      if (!blocks.length) return null;
      const truncated = blocks.some((block) => block.body.length > BODY_SOFT_LIMIT);
      return {
        sectionKind,
        title: sectionHeading(sectionKind, blocks[0]!.sectionTitle),
        blocks: blocks.map((block) => (
          block.body.length > BODY_SOFT_LIMIT
            ? {
                ...block,
                body: `${block.body.slice(0, BODY_SOFT_LIMIT)}\n…（内容较长，完整原文见附录提示；未改写）`,
              }
            : block
        )),
        truncated,
      };
    })
    .filter((item): item is ReportTextSectionModel => item !== null);

  const createdDate = localDate(now);
  return {
    title: 'HealthTrend Report / 健康指标趋势报告',
    createdDate,
    profileDisplayName: record.profile.displayName.trim(),
    medications,
    reportTextSections,
    appleHealthGroups,
    priorityIndicators: allSeries.filter((series) => series.priority),
    categories,
    provenance: buildProvenance(record, createdDate),
  };
}

export { SUPPORTED_TYPE_LABELS_ZH };


export { formatRegimenStageSummary, BODY_SOFT_LIMIT };

export { REPORT_TEMPLATE_ID, REPORT_TEMPLATE_VERSION, REPORT_DATA_SCHEMA_VERSION };
