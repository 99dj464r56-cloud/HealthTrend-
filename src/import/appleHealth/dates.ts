/**
 * Apple Health export timestamps look like: "2024-01-15 08:30:00 +0800"
 * Keep the original string and derive a local calendar date from the embedded offset
 * so UTC conversion never shifts the day.
 */
const APPLE_TS = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})\s*([+-]\d{2})(\d{2})$/;

export interface ParsedAppleTimestamp {
  original: string;
  localDate: string;
  utcMs: number;
}

export function parseAppleTimestamp(raw: string): ParsedAppleTimestamp | null {
  const value = raw.trim();
  const match = value.match(APPLE_TS);
  if (!match) return null;
  const [, y, mo, d, h, mi, s, offH, offM] = match;
  const localDate = `${y}-${mo}-${d}`;
  const sign = offH!.startsWith('-') ? -1 : 1;
  const offsetMinutes = sign * (Math.abs(Number(offH)) * 60 + Number(offM));
  const asUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  const utcMs = asUtc - offsetMinutes * 60_000;
  if (!Number.isFinite(utcMs)) return null;
  return { original: value, localDate, utcMs };
}

export function localDateInRange(localDate: string, from: string | null, to: string | null): boolean {
  if (from && localDate < from) return false;
  if (to && localDate > to) return false;
  return true;
}
