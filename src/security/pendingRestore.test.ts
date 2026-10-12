import { describe, expect, it, vi } from 'vitest';
import { emptyHealthRecord } from '../domain/types';
import { isSparseRecord, restorePendingRecord } from './pendingRestore';

const pending = { ...emptyHealthRecord(), profile: { displayName: 'Synthetic restore', identityConfirmed: true } };

describe('pending restore safety', () => {
  it.each(['appleHealthRecords', 'reportTextBlocks', 'regimenStages', 'sources'] as const)('does not treat %s-only records as empty', (key) => {
    expect(isSparseRecord({ ...emptyHealthRecord(), [key]: [{}] } as ReturnType<typeof emptyHealthRecord>)).toBe(false);
  });
  it('keeps a confirmed profile even without observations', () => {
    expect(isSparseRecord(pending)).toBe(false);
  });
  it('refuses automatic replacement of a nonempty current record', async () => {
    const save = vi.fn(); const confirm = vi.fn((message: string) => Boolean(message));
    expect(await restorePendingRecord(pending, pending, { confirm, save, load: vi.fn() })).toBeNull();
    expect(confirm).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
  });
  it('cancellation writes nothing', async () => {
    const save = vi.fn();
    expect(await restorePendingRecord(emptyHealthRecord(), pending, { confirm: () => false, save, load: vi.fn() })).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });
  it('requires confirmation and exact read-back before returning restored data', async () => {
    const save = vi.fn(); const load = vi.fn(async () => pending); const confirm = vi.fn((message: string) => Boolean(message));
    expect(await restorePendingRecord(emptyHealthRecord(), pending, { confirm, save, load })).toEqual(pending);
    expect(confirm.mock.calls[0]?.[0]).toContain('Synthetic restore'); expect(save).toHaveBeenCalledOnce();
  });
  it('a failed write is surfaced, not claimed as recovery', async () => {
    const load = vi.fn();
    await expect(restorePendingRecord(emptyHealthRecord(), pending, { confirm: () => true, save: async () => { throw new Error('disk full'); }, load })).rejects.toThrow('disk full');
    expect(load).not.toHaveBeenCalled();
  });
  it('read-back mismatch rolls back the empty prior record and rejects', async () => {
    const current = emptyHealthRecord(); const save = vi.fn(async () => {});
    await expect(restorePendingRecord(current, pending, { confirm: () => true, save, load: async () => current })).rejects.toThrow(/核验/);
    expect(save).toHaveBeenLastCalledWith(current, pending);
  });
});
