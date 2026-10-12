/**
 * Touch ID unlock via a WebAuthn platform passkey + PRF extension.
 *
 * The PRF output (32 secret bytes produced inside the authenticator only after Touch ID)
 * is fed through HKDF into an AES-GCM key that wraps the vault's data key. So Touch ID
 * cryptographically unlocks the data — nothing usable is stored without it.
 *
 * If the browser/authenticator does not support PRF we refuse to enable Touch ID rather
 * than store an unwrapped key in IndexedDB (that would make Touch ID cosmetic: anyone able
 * to read the browser profile could decrypt). The password always keeps working.
 */
import { fromBase64, importDataKey, randomBytes, toBase64, unwrapRawKey, wrapRawKey, type TouchIdWrap, type VaultMeta } from './vault';
import { nativeBridge } from '../native/bridge';

const HKDF_INFO = new TextEncoder().encode('health-trend-touchid-kek-v1');
const RP_NAME = 'HealthTrend';

export class TouchIdUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TouchIdUnavailableError';
  }
}

interface PrfResults { enabled?: boolean; results?: { first?: BufferSource } }

function isIpHost(hostname: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(':') || hostname.startsWith('[');
}

/** Hostname to use as WebAuthn rpId. IP literals (127.0.0.1) are not valid rpIds. */
export function touchIdRpId(): string | null {
  const host = window.location.hostname;
  return isIpHost(host) ? null : host;
}

export async function touchIdSupport(): Promise<{ ok: boolean; reason?: string }> {
  const native = nativeBridge();
  if (native) {
    const ok = await native.touchIdAvailable().catch(() => false);
    return ok ? { ok: true } : { ok: false, reason: '本机未检测到 Touch ID，或钥匙串不可用。' };
  }
  if (typeof window === 'undefined' || !window.isSecureContext || !('PublicKeyCredential' in window) || !navigator.credentials) {
    return { ok: false, reason: '此浏览器不支持 Touch ID 解锁。' };
  }
  if (!touchIdRpId()) {
    return { ok: false, reason: 'Touch ID 需通过 http://localhost:5180 打开（127.0.0.1 不支持通行密钥）。' };
  }
  const pkc = window.PublicKeyCredential as unknown as {
    isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>;
    getClientCapabilities?: () => Promise<Record<string, boolean>>;
  };
  try {
    if (pkc.isUserVerifyingPlatformAuthenticatorAvailable && !await pkc.isUserVerifyingPlatformAuthenticatorAvailable()) {
      return { ok: false, reason: '本机未检测到 Touch ID / 平台验证器。' };
    }
    if (pkc.getClientCapabilities) {
      const caps = await pkc.getClientCapabilities();
      if (caps['extension:prf'] === false) return { ok: false, reason: '此浏览器不支持安全的 Touch ID 解锁（需 WebAuthn PRF），请使用密码。' };
    }
  } catch {
    // Capability probing is best-effort; enrollment verifies PRF for real.
  }
  return { ok: true };
}

async function kekFromPrf(prfOutput: BufferSource): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: HKDF_INFO },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function prfFirst(credential: PublicKeyCredential): BufferSource | null {
  const ext = credential.getClientExtensionResults() as { prf?: PrfResults };
  return ext.prf?.results?.first ?? null;
}

async function assertWithPrf(rpId: string, credentialId: Uint8Array<ArrayBuffer>, prfSalt: Uint8Array<ArrayBuffer>): Promise<BufferSource> {
  const credential = await navigator.credentials.get({
    publicKey: {
      rpId,
      challenge: randomBytes(32),
      allowCredentials: [{ type: 'public-key', id: credentialId }],
      userVerification: 'required',
      timeout: 60_000,
      extensions: { prf: { eval: { first: prfSalt } } } as AuthenticationExtensionsClientInputs,
    },
  }) as PublicKeyCredential | null;
  const first = credential ? prfFirst(credential) : null;
  if (!first) throw new TouchIdUnavailableError('该通行密钥未返回 PRF 密钥，无法安全地用 Touch ID 解锁。');
  return first;
}

/** Create a platform passkey and wrap the raw DEK with its PRF output. */
export async function enrollTouchId(rawKey: Uint8Array<ArrayBuffer>): Promise<TouchIdWrap> {
  const native = nativeBridge();
  if (native) {
    await native.touchIdEnroll(toBase64(rawKey));
    return { kind: 'native', createdAt: new Date().toISOString() };
  }
  const rpId = touchIdRpId();
  if (!rpId) throw new TouchIdUnavailableError('Touch ID 需通过 http://localhost:5180 打开。');
  const prfSalt = randomBytes(32);
  const created = await navigator.credentials.create({
    publicKey: {
      rp: { id: rpId, name: RP_NAME },
      user: { id: randomBytes(16), name: 'health-trend-personal', displayName: '健康档案（本机）' },
      challenge: randomBytes(32),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60_000,
      extensions: { prf: { eval: { first: prfSalt } } } as AuthenticationExtensionsClientInputs,
    },
  }) as PublicKeyCredential | null;
  if (!created) throw new TouchIdUnavailableError('已取消。');
  const ext = created.getClientExtensionResults() as { prf?: PrfResults };
  if (ext.prf?.enabled === false) throw new TouchIdUnavailableError('此浏览器的通行密钥不支持 PRF，无法安全地启用 Touch ID；请继续使用密码。');
  const credentialId = new Uint8Array(created.rawId);
  // Some authenticators only evaluate PRF on get(): do one assertion (second Touch ID prompt).
  const first = prfFirst(created) ?? await assertWithPrf(rpId, credentialId, prfSalt);
  const kek = await kekFromPrf(first);
  return {
    credentialId: toBase64(credentialId),
    prfSalt: toBase64(prfSalt),
    wrappedKey: await wrapRawKey(kek, rawKey),
    createdAt: new Date().toISOString(),
  };
}

/** Touch ID prompt -> PRF -> unwrap DEK -> non-extractable data key. */
export async function unlockWithTouchId(meta: VaultMeta): Promise<CryptoKey> {
  const wrap = meta.touchId;
  if (wrap?.kind === 'native') {
    const native = nativeBridge();
    if (!native) throw new TouchIdUnavailableError('Touch ID 解锁只在 HealthTrend 桌面应用中可用，请使用密码。');
    const raw = fromBase64(await native.touchIdUnlock());
    try {
      return await importDataKey(raw);
    } finally {
      raw.fill(0);
    }
  }
  const rpId = touchIdRpId();
  if (!wrap || !rpId) throw new TouchIdUnavailableError('未启用 Touch ID 解锁。');
  const first = await assertWithPrf(rpId, fromBase64(wrap.credentialId), fromBase64(wrap.prfSalt));
  const raw = await unwrapRawKey(await kekFromPrf(first), wrap.wrappedKey).catch(() => {
    throw new TouchIdUnavailableError('Touch ID 验证未能解开密钥，请使用密码。');
  });
  try {
    return await importDataKey(raw);
  } finally {
    raw.fill(0);
  }
}
