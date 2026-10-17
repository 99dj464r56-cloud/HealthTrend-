import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearHealthRecord, setActiveWorkspace } from '../storage/indexedDb';
import {
  compareSyncFreshness,
  describeFreshness,
  dismissLaunchPrompt,
  getSyncState,
  launchPromptDismissedFor,
  markSynced,
  parseEnvelopeText,
  syncPasswordUsedBefore,
} from './icloudSync';

describe('iCloud sync freshness', () => {
  it('treats a file exported after the last local change as newer', () => {
    expect(compareSyncFreshness({ fileCreatedAt: '2026-01-02T10:00:00.000Z', localUpdatedAt: '2026-01-02T09:00:00.000Z' })).toBe('file-newer');
    expect(compareSyncFreshness({ fileCreatedAt: '2026-01-02T08:00:00.000Z', localUpdatedAt: '2026-01-02T09:00:00.000Z' })).toBe('local-newer');
  });

  it('does not re-offer the file this device last saved or restored', () => {
    expect(compareSyncFreshness({
      fileCreatedAt: '2026-01-02T10:00:00.000Z',
      localUpdatedAt: '2026-01-02T09:00:00.000Z',
      lastSyncedCreatedAt: '2026-01-02T10:00:00.000Z',
    })).toBe('same');
  });

  it('flags a conflict when local data changed since the last sync', () => {
    expect(compareSyncFreshness({
      fileCreatedAt: '2026-01-03T10:00:00.000Z',
      localUpdatedAt: '2026-01-02T12:00:00.000Z',
      lastSyncedCreatedAt: '2026-01-01T10:00:00.000Z',
      lastSyncedLocalUpdatedAt: '2026-01-01T10:00:01.000Z',
    })).toBe('conflict');
  });

  it('reports unknown when a legacy local record has no updatedAt', () => {
    const freshness = compareSyncFreshness({ fileCreatedAt: '2026-01-02T10:00:00.000Z', localUpdatedAt: undefined });
    expect(freshness).toBe('local-unknown');
    expect(describeFreshness(freshness, '2026-01-02T10:00:00.000Z', undefined)).toContain('未知');
  });

  it('accepts only encrypted envelopes', () => {
    expect(parseEnvelopeText('{"schemaVersion":4}')).toBeNull();
    expect(parseEnvelopeText('not json')).toBeNull();
    expect(parseEnvelopeText(null)).toBeNull();
  });
});

describe('iCloud sync settings', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    setActiveWorkspace('personal');
  });
  afterEach(async () => {
    await clearHealthRecord();
    setActiveWorkspace('guest');
    vi.unstubAllGlobals();
  });

  it('remembers last synced file and launch dismissals without storing a password', async () => {
    expect(await syncPasswordUsedBefore()).toBe(false);
    await markSynced('2026-01-02T10:00:00.000Z', '2026-01-02T10:00:01.000Z');
    expect(await getSyncState()).toEqual({
      lastSyncedCreatedAt: '2026-01-02T10:00:00.000Z',
      lastSyncedLocalUpdatedAt: '2026-01-02T10:00:01.000Z',
    });
    expect(await syncPasswordUsedBefore()).toBe(true);
    expect(await launchPromptDismissedFor('x')).toBe(false);
    await dismissLaunchPrompt('x');
    expect(await launchPromptDismissedFor('x')).toBe(true);
  });
});
