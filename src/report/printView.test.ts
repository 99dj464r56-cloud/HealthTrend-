// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { HealthRecord } from '../domain/types';
import { createPrintView } from './printView';
import { buildReportModel } from './reportModel';

describe('print view safety and layout groups', () => {
  it('renders untrusted imported names as text rather than executable HTML', () => {
    const record: HealthRecord = {
      schemaVersion: 1, medications: [], observations: [], sources: [],
      indicators: [{
        id: 'x', nameZh: '示例', nameEn: '<img src=x onerror=alert(1)>', purposeZh: '用途', purposeEn: 'Purpose',
        category: 'Group', unit: 'U/L', lowerLimit: null, upperLimit: null, priority: false,
      }],
    };
    const view = createPrintView(buildReportModel(record), { onPrint: () => undefined, onBack: () => undefined });
    expect(view.querySelector('img,script')).toBeNull();
    expect(view.querySelector('.chart-title-en')?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(view.querySelector('.category-section')).not.toBeNull();
    expect(view.querySelector('.chart-empty')?.textContent).toContain('No measurements');
  });
});
