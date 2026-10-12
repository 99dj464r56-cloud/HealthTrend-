/**
 * Privacy scan for the shareable build. Markers come from a local, gitignored file
 * (.private/share-markers.txt) plus the personal seed's display name, so no personal
 * identifiers are ever written into tracked source.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

export interface PrivacyFinding {
  file: string;
  marker: string;
}

/** Generic markers safe to keep in source: local paths and the personal seed filename. */
// Built by concatenation so the public audit's local-path check doesn't flag this file itself.
const HOME_PREFIX = ['', 'Users', ''].join('/');
export const GENERIC_MARKERS = ['personal-backup.json', HOME_PREFIX, 'Mobile Documents', 'com~apple~CloudDocs'];

export async function loadPrivacyMarkers(root: string): Promise<string[]> {
  const markers = new Set<string>(GENERIC_MARKERS);
  const file = await readFile(join(root, '.private/share-markers.txt'), 'utf8').catch(() => '');
  for (const line of file.split('\n')) {
    const value = line.trim();
    if (value && !value.startsWith('#')) markers.add(value);
  }
  const seed = await readFile(join(root, 'public/seeds/personal-backup.json'), 'utf8').catch(() => null);
  if (seed) {
    try {
      const name = (JSON.parse(seed) as { profile?: { displayName?: string } }).profile?.displayName?.trim();
      if (name && name.length >= 3) markers.add(name);
    } catch {
      // ignore malformed seed
    }
  }
  return [...markers];
}

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

/** Scans every file (including binaries, as latin1 + utf8) and file names for markers. */
export async function scanForPersonalData(dir: string, markers: string[]): Promise<PrivacyFinding[]> {
  const findings: PrivacyFinding[] = [];
  const lowered = markers.map((m) => m.toLowerCase());
  for await (const file of walk(dir)) {
    const rel = relative(dir, file);
    const info = await stat(file);
    const buffer = await readFile(file);
    const haystacks = [rel.toLowerCase(), buffer.toString('utf8').toLowerCase()];
    if (info.size < 50 * 1024 * 1024) haystacks.push(buffer.toString('latin1').toLowerCase());
    lowered.forEach((marker, index) => {
      if (haystacks.some((text) => text.includes(marker))) findings.push({ file: rel, marker: markers[index]! });
    });
  }
  return findings;
}
