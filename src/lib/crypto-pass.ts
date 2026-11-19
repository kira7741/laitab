import type { EncryptedSecret } from './types';
import { b64urlToBytes, bytesToB64url, decodeUtf8B64url, encodeUtf8B64url } from './codec';

function asBuf(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 120_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptSecret(plaintext: string, passphrase: string): Promise<EncryptedSecret> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, asBuf(salt));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: asBuf(iv) }, key, new TextEncoder().encode(plaintext)),
  );
  return {
    salt: bytesToB64url(salt),
    iv: bytesToB64url(iv),
    ct: bytesToB64url(ct),
  };
}

export async function decryptSecret(enc: EncryptedSecret, passphrase: string): Promise<string> {
  const salt = b64urlToBytes(enc.salt);
  const iv = b64urlToBytes(enc.iv);
  const ct = b64urlToBytes(enc.ct);
  const key = await deriveKey(passphrase, asBuf(salt));
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: asBuf(iv) }, key, asBuf(ct));
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error('That passphrase does not unlock this lai see.');
  }
}

/** Small helper used if we ever need to stash non-secret notes. */
export function hide(text: string): string {
  return encodeUtf8B64url(text);
}
export function unhide(text: string): string {
  return decodeUtf8B64url(text);
}
