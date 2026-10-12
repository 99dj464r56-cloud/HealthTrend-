// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { HealthRecord } from '../domain/types';
import { emptyHealthRecord } from '../domain/types';
import { createPrintView } from './printView';
import { buildReportModel } from './reportModel';

describe('print view safety and layout groups', () => {
  it('renders untrusted imported names as text rather than executable HTML', () => {
    const record: HealthRecord = {
      ...emptyHealthRecord(),
      profile: { displayName: 'Alex Demo', identityConfirmed: true },
      medications: [], observations: [], sources: [],
      indicators: [{
        id: 'x', nameZh: '示例', nameEn: '<img src=x onerror=alert(1)>', purposeZh: '用途', purposeEn: 'Purpose',
        category: 'Group', unit: 'U/L', lowerLimit: null, upperLimit: null, priority: false,
      }],
      reportTextBlocks: [{
        id: 't1', sourceId: null, reportName: 'R', reportDate: null, laboratory: null, pageNumber: null,
        sectionTitle: '结论', sectionKind: 'conclusion',
        body: '<script>alert(1)</script>', kind: 'verbatim',
        contentFingerprint: 'r', confirmed: true,
      }],
    };
    const view = createPrintView(buildReportModel(record), { onPrint: () => undefined, onBack: () => undefined });
    expect(view.querySelector('img,script')).toBeNull();
    expect(view.querySelector('.chart-title-en')?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(view.querySelector('.category-section')).not.toBeNull();
    expect(view.querySelector('.chart-empty')?.textContent).toContain('No measurements');
    expect(view.querySelector('[data-profile-subject]')?.textContent).toContain('Alex Demo');
    expect(view.querySelector('[data-report-text]')?.textContent).toContain('<script>alert(1)</script>');
  });
});
