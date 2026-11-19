/** URL-safe encoding for shareable tab and lai see payloads. */

export function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeJson<T>(value: T): string {
  const json = JSON.stringify(value);
  return bytesToB64url(new TextEncoder().encode(json));
}

export function decodeJson<T>(payload: string): T {
  const text = new TextDecoder().decode(b64urlToBytes(payload));
  return JSON.parse(text) as T;
}

export function encodeUtf8B64url(text: string): string {
  return bytesToB64url(new TextEncoder().encode(text));
}

export function decodeUtf8B64url(payload: string): string {
  return new TextDecoder().decode(b64urlToBytes(payload));
}
