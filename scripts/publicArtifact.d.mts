export const staticFiles: string[];
export function auditPublicArtifact(dir: string, committedDemo: string | Buffer, options?: { required?: string[] }): Promise<Array<{ path: string; bytes: number; sha256: string }>>;
