import type { HealthRecord, Medication } from '../domain/types';
import { buildSeries, type ChartSeries } from '../charts/series';

export interface ReportCategory {
  category: string;
  series: ChartSeries[];
}

export interface ReportModel {
  title: string;
  createdDate: string;
  medications: Medication[];
  priorityIndicators: ChartSeries[];
  categories: ReportCategory[];
}

function localDate(date: Date): string {
  const part = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}`;
}

export function buildReportModel(record: HealthRecord, now = new Date()): ReportModel {
  const allSeries = record.indicators.flatMap((indicator) => buildSeries(indicator, record.observations, record.medications));
  const categories = [...new Set(allSeries.map((series) => series.category))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
    .map((category) => ({
      category,
      series: allSeries.filter((series) => series.category === category),
    }));
  return {
    title: 'Health Trend Report / 健康指标趋势报告',
    createdDate: localDate(now),
    medications: record.medications,
    priorityIndicators: allSeries.filter((series) => series.priority),
    categories,
  };
}
