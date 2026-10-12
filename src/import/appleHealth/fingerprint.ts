import type { AppleHealthKind } from '../../domain/types';

export function appleHealthFingerprint(input: {
  kind: AppleHealthKind;
  typeIdentifier: string;
  value: number | null;
  unit: string | null;
  startAt: string;
  endAt: string | null;
  sourceName: string | null;
  sourceBundleOrDevice: string | null;
  workoutActivityType: string | null;
  duration: number | null;
  durationUnit: string | null;
}): string {
  return [
    input.kind,
    input.typeIdentifier,
    input.value ?? '',
    input.unit ?? '',
    input.startAt.trim(),
    input.endAt?.trim() ?? '',
    (input.sourceName ?? '').trim().toLowerCase(),
    (input.sourceBundleOrDevice ?? '').trim().toLowerCase(),
    input.workoutActivityType ?? '',
    input.duration ?? '',
    input.durationUnit ?? '',
  ].join('|');
}
