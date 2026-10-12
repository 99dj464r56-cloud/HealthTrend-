/** Calendar date → UTC noon ms so YYYY-MM-DD spacing is stable across time zones. */
export function dateToMs(date: string): number {
  return Date.parse(`${date}T12:00:00Z`);
}

const SAME_DAY_JITTER_PX = 10;

/**
 * Map points onto [left, right] by real elapsed time.
 * Same-calendar-day multiples get a small horizontal jitter so they stay distinguishable;
 * historical points are never dropped.
 */
export function assignTimeScaleX(
  dates: readonly string[],
  left: number,
  right: number,
): number[] {
  if (!dates.length) return [];
  if (dates.length === 1) return [(left + right) / 2];

  const ms = dates.map(dateToMs);
  const minMs = Math.min(...ms);
  const maxMs = Math.max(...ms);
  const span = maxMs - minMs;
  const base = ms.map((value) => (
    span === 0
      ? (left + right) / 2
      : left + ((value - minMs) / span) * (right - left)
  ));

  const indicesByDate = new Map<string, number[]>();
  dates.forEach((date, index) => {
    const list = indicesByDate.get(date) ?? [];
    list.push(index);
    indicesByDate.set(date, list);
  });

  const result = [...base];
  for (const indices of indicesByDate.values()) {
    if (indices.length <= 1) continue;
    const mid = (indices.length - 1) / 2;
    indices.forEach((pointIndex, order) => {
      const jittered = base[pointIndex]! + (order - mid) * SAME_DAY_JITTER_PX;
      result[pointIndex] = Math.max(left, Math.min(right, jittered));
    });
  }
  return result;
}

/** Full ISO calendar date for latest-three / axis labels. */
export function fullDateLabel(date: string): string {
  return date;
}
