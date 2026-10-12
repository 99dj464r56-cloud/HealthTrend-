import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrateHealthRecord } from '../domain/migrate';
import { validateHealthRecord } from '../domain/validation';

const seedPath = join(dirname(fileURLToPath(import.meta.url)), '../../public/seeds/demo-record.json');

describe('demo seed record', () => {
  it('validates as a schema v4 HealthRecord with demo profile and categories', () => {
    const raw = JSON.parse(readFileSync(seedPath, 'utf8'));
    const record = validateHealthRecord(migrateHealthRecord(raw));
    expect(record.profile.displayName).toContain('Demo User');
    expect(record.medications.length).toBeGreaterThanOrEqual(3);
    expect(record.indicators.length).toBeGreaterThanOrEqual(20);
    expect(record.observations.length).toBeGreaterThanOrEqual(20);
    const cats = new Set(record.indicators.map((i) => i.category));
    expect([...cats].some((c) => /血脂|Lipids/i.test(c))).toBe(true);
    expect([...cats].some((c) => /骨代谢|Bone/i.test(c))).toBe(true);
    expect([...cats].some((c) => /肿瘤|Tumor/i.test(c))).toBe(true);
  });
});
