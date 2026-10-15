/** Workspace modes: guest (empty), personal (device-local), demo (synthetic reference). */

export type WorkspaceMode = 'guest' | 'personal' | 'demo';

export const WORKSPACE_DB: Record<WorkspaceMode, string> = {
  guest: 'health-trend-guest',
  /** Existing production DB name — keeps prior personal IndexedDB intact. */
  personal: 'health-trend-pdf',
  demo: 'health-trend-demo',
};

/**
 * Resolve mode from `?mode=guest|personal|demo` or hash `#/guest` `#/me` `#/demo`.
 * No mode → landing chooser.
 */
export function resolveWorkspaceMode(search = window.location.search, hash = window.location.hash): WorkspaceMode | null {
  const params = new URLSearchParams(search);
  const fromQuery = params.get('mode');
  if (fromQuery === 'guest' || fromQuery === 'personal' || fromQuery === 'demo') return fromQuery;
  const h = hash.replace(/^#\/?/, '').toLowerCase();
  if (h === 'guest') return 'guest';
  if (h === 'me' || h === 'personal') return 'personal';
  if (h === 'demo') return 'demo';
  return null;
}

export function workspaceHref(mode: WorkspaceMode): string {
  const url = new URL(window.location.href);
  url.searchParams.set('mode', mode);
  url.hash = '';
  return `${url.pathname}${url.search}`;
}

export function chooserHref(): string {
  const url = new URL(window.location.href);
  url.searchParams.delete('mode');
  url.hash = '';
  return `${url.pathname}${url.search}` || './';
}
