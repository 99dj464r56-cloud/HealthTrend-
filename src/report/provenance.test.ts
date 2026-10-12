// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { HealthRecord, Indicator, Observation } from '../domain/types';
import { emptyHealthRecord } from '../domain/types';
import { buildReportModel, REPORT_TEMPLATE_ID } from './reportModel';
import { createPrintView } from './printView';

function indicator(partial: Partial<Indicator> & Pick<Indicator, 'id' | 'nameZh' | 'category' | 'unit' | 'priority'>): Indicator {
  return {
    nameEn: partial.nameEn ?? partial.nameZh,
    purposeZh: 'synthetic',
    purposeEn: 'synthetic',
    lowerLimit: null,
    upperLimit: null,
    ...partial,
  };
}

function obs(partial: Partial<Observation> & Pick<Observation, 'id' | 'indicatorId' | 'date' | 'value' | 'unit'>): Observation {
  return {
    rawValue: String(partial.value ?? ''),
    comparator: 'none',
    lowerLimit: partial.lowerLimit ?? null,
    upperLimit: partial.upperLimit ?? null,
    rangeProvenance: partial.rangeProvenance ?? 'from-report',
    laboratory: partial.laboratory ?? null,
    method: null,
    specimen: null,
    sourceId: partial.sourceId ?? null,
    pageNumber: partial.pageNumber ?? null,
    confirmed: true,
    ...partial,
  };
}

describe('PDF provenance data retained; appendix omitted from print', () => {
  it('includes template id, sources, confirmation, and revision notes in the print view', () => {
    const record: HealthRecord = {
      ...emptyHealthRecord(),
      profile: { displayName: 'Alex Demo', identityConfirmed: true },
      sources: [{ id: 'src-1', fileName: 'demo.pdf', type: 'pdf', importedAt: '2026-01-01T00:00:00.000Z', pageCount: 2 }],
      indicators: [indicator({ id: 'a', nameZh: '重点甲', nameEn: 'Priority A', category: '血脂', unit: 'mmol/L', priority: true })],
      observations: [obs({ id: 'o1', indicatorId: 'a', date: '2026-01-02', value: 2, unit: 'mmol/L', sourceId: 'src-1', pageNumber: 1, laboratory: 'Lab A' })],
    };
    const model = buildReportModel(record);
    expect(model.provenance.templateId).toBe(REPORT_TEMPLATE_ID);
    expect(model.provenance.originalFilesRetained).toBe(false);
    expect(model.provenance.sources[0]?.fileName).toBe('demo.pdf');
    expect(model.provenance.observations[0]).toMatchObject({
      sourceFileName: 'demo.pdf', pageNumber: 1, confirmed: true, laboratory: 'Lab A',
    });
    const view = createPrintView(model, { onPrint: () => undefined, onBack: () => undefined });
    // Provenance remains on the model / in IndexedDB, but the printed report omits the appendix.
    expect(view.querySelector('[data-provenance-appendix]')).toBeNull();
    expect(view.textContent).toContain('health-trend-pdf-report@');
    expect(view.textContent).not.toContain('附录：资料来源');
    expect(model.provenance.observations[0]?.confirmed).toBe(true);
  });

  it('keeps priority indicators in both highlight and category sections at modest scale', () => {
    const indicators: Indicator[] = [];
    const observations: Observation[] = [];
    // Synthetic CBC-like panel (23) + extra categories toward multi-panel coverage
    for (let i = 0; i < 23; i += 1) {
      const id = `cbc-${i}`;
      indicators.push(indicator({
        id, nameZh: `血细胞合成${i}`, nameEn: `CBC synthetic ${i}`, category: '血细胞分析', unit: 'U', priority: i < 2,
      }));
      observations.push(obs({ id: `o-${id}`, indicatorId: id, date: '2026-01-10', value: i + 1, unit: 'U' }));
    }
    for (let i = 0; i < 12; i += 1) {
      const id = `chem-${i}`;
      indicators.push(indicator({
        id,
        nameZh: `生化合成指标名称偏长示例${i}`,
        nameEn: `Chemistry synthetic deliberately long English name ${i}`,
        category: i % 2 === 0 ? '肝功能' : '肾功能',
        unit: 'mmol/L',
        priority: false,
      }));
      observations.push(obs({
        id: `o-${id}-a`, indicatorId: id, date: '2025-06-01', value: 1, unit: 'mmol/L',
        lowerLimit: 0, upperLimit: 2, laboratory: 'Lab A', rangeProvenance: 'from-report',
      }));
      observations.push(obs({
        id: `o-${id}-b`, indicatorId: id, date: '2026-01-10', value: 3, unit: 'mmol/L',
        lowerLimit: 0.5, upperLimit: 2.5, laboratory: 'Lab B', rangeProvenance: 'from-report',
      }));
    }
    // Same-day pair
    observations.push(obs({ id: 'same-am', indicatorId: 'cbc-0', date: '2026-01-10', value: 1.1, unit: 'U' }));

    const record: HealthRecord = {
      ...emptyHealthRecord(),
      profile: { displayName: 'Scale Demo', identityConfirmed: true },
      indicators,
      observations,
    };
    const model = buildReportModel(record);
    expect(model.priorityIndicators).toHaveLength(2);
    expect(model.categories.length).toBeGreaterThanOrEqual(3);
    for (const series of model.priorityIndicators) {
      const inCategory = model.categories.some((category) => category.series.some((item) => item.indicatorId === series.indicatorId));
      expect(inCategory).toBe(true);
    }
    expect(model.provenance.observations.length).toBe(observations.length);
    const view = createPrintView(model, { onPrint: () => undefined, onBack: () => undefined });
    expect(view.querySelectorAll('.priority-section .chart-card')).toHaveLength(2);
    expect(view.querySelectorAll('.category-section .chart-card').length).toBe(indicators.length);
  });
});
