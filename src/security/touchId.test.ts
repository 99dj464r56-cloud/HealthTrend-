import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVault, decryptJson, encryptJson } from './vault';
import { TouchIdUnavailableError, enrollTouchId, touchIdSupport, unlockWithTouchId } from './touchId';

/** Mock platform authenticator: PRF output = HMAC(secret, salt), only after "Touch ID". */
function installMockWebAuthn(options: { prf: boolean; hostname?: string }) {
  const secret = crypto.getRandomValues(new Uint8Array(32));
  let userApproves = true;
  const prfFor = async (salt: BufferSource) => {
    const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return crypto.subtle.sign('HMAC', key, salt);
  };
  const credentials = {
    create: vi.fn(async ({ publicKey }: CredentialCreationOptions) => {
      if (!userApproves) throw new DOMException('denied', 'NotAllowedError');
      expect(publicKey?.authenticatorSelection?.authenticatorAttachment).toBe('platform');
      return {
        rawId: new Uint8Array([1, 2, 3, 4]).buffer,
        getClientExtensionResults: () => (options.prf ? { prf: { enabled: true } } : {}),
      };
    }),
    get: vi.fn(async ({ publicKey }: CredentialRequestOptions) => {
      if (!userApproves) throw new DOMException('denied', 'NotAllowedError');
      const salt = (publicKey?.extensions as { prf?: { eval?: { first?: BufferSource } } }).prf?.eval?.first;
      return {
        rawId: new Uint8Array([1, 2, 3, 4]).buffer,
        getClientExtensionResults: () => (options.prf && salt ? { prf: { results: { first: new Uint8Array(0).buffer && undefined } } } : {}),
        _salt: salt,
      };
    }),
  };
  // Resolve PRF asynchronously: wrap get() so results.first is real.
  const rawGet = credentials.get;
  credentials.get = vi.fn(async (args: CredentialRequestOptions) => {
    const cred = await rawGet(args) as { _salt?: BufferSource; rawId: ArrayBuffer };
    const first = options.prf && cred._salt ? await prfFor(cred._salt) : null;
    return { rawId: cred.rawId, getClientExtensionResults: () => (first ? { prf: { results: { first } } } : {}) };
  }) as typeof credentials.get;
  vi.stubGlobal('navigator', { credentials });
  vi.stubGlobal('window', {
    isSecureContext: true,
    location: { hostname: options.hostname ?? 'localhost' },
    PublicKeyCredential: { isUserVerifyingPlatformAuthenticatorAvailable: async () => true },
  });
  return { credentials, deny: () => { userApproves = false; } };
}

describe('Touch ID unlock (WebAuthn PRF, mocked authenticator)', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('wraps the data key with PRF output and unlocks the same data', async () => {
    installMockWebAuthn({ prf: true });
    const vault = await createVault('test-only-password', 100_000);
    const blob = await encryptJson(vault.key, { ok: 1 });
    const touchId = await enrollTouchId(vault.rawKey);
    expect(JSON.stringify(touchId)).not.toContain(btoa(String.fromCharCode(...vault.rawKey)));
    const key = await unlockWithTouchId({ ...vault.meta, touchId });
    expect(key.extractable).toBe(false);
    await expect(decryptJson(key, blob)).resolves.toEqual({ ok: 1 });
  });

  it('refuses to enable Touch ID when PRF is unavailable (no insecure fallback)', async () => {
    installMockWebAuthn({ prf: false });
    const vault = await createVault('test-only-password', 100_000);
    await expect(enrollTouchId(vault.rawKey)).rejects.toBeInstanceOf(TouchIdUnavailableError);
  });

  it('fails closed when the user cancels Touch ID', async () => {
    const mock = installMockWebAuthn({ prf: true });
    const vault = await createVault('test-only-password', 100_000);
    const touchId = await enrollTouchId(vault.rawKey);
    mock.deny();
    await expect(unlockWithTouchId({ ...vault.meta, touchId })).rejects.toThrow();
  });

  it('a different passkey secret cannot unwrap the key', async () => {
    installMockWebAuthn({ prf: true });
    const vault = await createVault('test-only-password', 100_000);
    const touchId = await enrollTouchId(vault.rawKey);
    installMockWebAuthn({ prf: true }); // new authenticator secret
    await expect(unlockWithTouchId({ ...vault.meta, touchId })).rejects.toBeInstanceOf(TouchIdUnavailableError);
  });

  it('reports 127.0.0.1 as unsupported (IP is not a valid rpId)', async () => {
    installMockWebAuthn({ prf: true, hostname: '127.0.0.1' });
    const support = await touchIdSupport();
    expect(support.ok).toBe(false);
    expect(support.reason).toContain('localhost');
  });
});
