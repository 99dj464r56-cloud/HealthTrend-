import { describe, expect, it } from 'vitest';
import { resolveWorkspaceMode, WORKSPACE_DB } from './mode';

describe('resolveWorkspaceMode', () => {
  it('reads query and hash for guest, personal, and demo', () => {
    expect(resolveWorkspaceMode('?mode=guest', '')).toBe('guest');
    expect(resolveWorkspaceMode('?mode=personal', '')).toBe('personal');
    expect(resolveWorkspaceMode('?mode=demo', '')).toBe('demo');
    expect(resolveWorkspaceMode('', '#/me')).toBe('personal');
    expect(resolveWorkspaceMode('', '#/guest')).toBe('guest');
    expect(resolveWorkspaceMode('', '#/demo')).toBe('demo');
    expect(resolveWorkspaceMode('', '')).toBeNull();
  });

  it('uses distinct IndexedDB names', () => {
    expect(WORKSPACE_DB.guest).toBe('health-trend-guest');
    expect(WORKSPACE_DB.personal).toBe('health-trend-pdf');
    expect(WORKSPACE_DB.demo).toBe('health-trend-demo');
  });
});
