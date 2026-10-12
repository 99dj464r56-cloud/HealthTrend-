/** Bridge exposed by the HealthTrend desktop app (electron/preload.cjs). Absent in the browser. */
export interface NativeBackupStatus {
  enabled: boolean;
  dir: string | null;
  label?: string;
  icloud?: boolean;
  exists: boolean;
  modifiedAt: string | null;
}

export interface HealthTrendNative {
  platform: string;
  backupStatus(): Promise<NativeBackupStatus>;
  chooseBackupDir(): Promise<string | null>;
  readBackup(): Promise<string | null>;
  writeBackup(text: string): Promise<{ savedAt: string }>;
  touchIdAvailable(): Promise<boolean>;
  touchIdEnroll(rawKeyBase64: string): Promise<boolean>;
  touchIdUnlock(): Promise<string>;
  touchIdClear(): Promise<boolean>;
  printReport(): Promise<{ ok: boolean; reason?: string }>;
}

export function nativeBridge(): HealthTrendNative | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { healthTrendNative?: HealthTrendNative }).healthTrendNative ?? null;
}
