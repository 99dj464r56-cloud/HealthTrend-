import { describe, expect, it } from 'vitest';
import * as manual from './manual';
import type { Indicator } from '../domain/types';

const indicator: Indicator = {
  id: 'creatinine', nameZh: '肌酐', nameEn: 'Creatinine', purposeZh: '观察肾功能', purposeEn: 'Tracks kidney function',
  category: '肾功能', unit: 'μmol/L', lowerLimit: null, upperLimit: 100, priority: false,
};

describe('manual entry helpers', () => {
  it('leaves a blank reference limit unset rather than converting it to zero', () => {
    const parse = Reflect.get(manual, 'parseOptionalLimit');
    expect(typeof parse).toBe('function');
    expect(typeof parse === 'function' ? parse('   ') : undefined).toBeNull();
  });

  it('creates only explicitly confirmed observations with the indicator unit', () => {
    const create = Reflect.get(manual, 'createManualObservation');
    expect(typeof create).toBe('function');
    const result = typeof create === 'function' ? create(indicator, { id: 'reading-1', date: '2025-03-11', value: '88.4' }) : undefined;
    expect(result).toEqual({
      id: 'reading-1', indicatorId: 'creatinine', date: '2025-03-11', value: 88.4, unit: 'μmol/L', sourceId: null, confirmed: true,
    });
  });
});
