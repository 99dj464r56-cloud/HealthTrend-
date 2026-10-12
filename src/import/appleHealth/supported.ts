/** Supported Apple Health export type identifiers (manual XML import only). */
export const SUPPORTED_QUANTITY_TYPES = [
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierHeartRate',
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierAppleExerciseTime',
] as const;

export type SupportedQuantityType = (typeof SUPPORTED_QUANTITY_TYPES)[number];

export const SUPPORTED_QUANTITY_TYPE_SET = new Set<string>(SUPPORTED_QUANTITY_TYPES);

export const SUPPORTED_TYPE_LABELS_ZH: Record<string, string> = {
  HKQuantityTypeIdentifierStepCount: '步数',
  HKQuantityTypeIdentifierActiveEnergyBurned: '活动能量',
  HKQuantityTypeIdentifierDistanceWalkingRunning: '步行+跑步距离',
  HKQuantityTypeIdentifierHeartRate: '心率',
  HKQuantityTypeIdentifierBodyMass: '体重',
  HKQuantityTypeIdentifierAppleExerciseTime: '锻炼时长',
  Workout: '训练 Workout',
  ActivitySummary: '每日活动摘要 ActivitySummary',
};

export function listSupportedAppleHealthTypesForUi(): string[] {
  return [
    ...SUPPORTED_QUANTITY_TYPES.map((type) => `${SUPPORTED_TYPE_LABELS_ZH[type] ?? type} (${type})`),
    '训练记录 Workout（类型 + 时长；忽略路线/GPS）',
    '每日活动摘要 ActivitySummary（活动能量 / 锻炼分钟 / 站立小时）',
  ];
}

export function categoryForAppleType(typeIdentifier: string, kind: 'sample' | 'workout' | 'activitySummary'): string {
  if (kind === 'workout') return 'Apple 健康 · 训练';
  if (kind === 'activitySummary') return 'Apple 健康 · 每日活动摘要';
  if (typeIdentifier.includes('HeartRate')) return 'Apple 健康 · 心率';
  if (typeIdentifier.includes('BodyMass')) return 'Apple 健康 · 体重';
  if (typeIdentifier.includes('Step') || typeIdentifier.includes('Distance') || typeIdentifier.includes('Energy') || typeIdentifier.includes('Exercise')) {
    return 'Apple 健康 · 活动';
  }
  return 'Apple 健康 · 其他';
}
