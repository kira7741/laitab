/**
 * OP_RETURN helpers. Lengths are UTF-8 bytes, not JavaScript string units.
 * Pushes use standard data-push opcodes (not VM-number shortcuts), so a
 * 76-byte payload is PUSHDATA1 and a one-byte '1' is still 0x01 0x31.
 */

export const MAX_MEMO_BYTES = 80;
export const OP_RETURN = 0x6a;
export const OP_PUSHDATA1 = 0x4c;
export const OP_PUSHDATA2 = 0x4d;

export function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** Truncate a string so its UTF-8 encoding is at most maxBytes, on a code-point boundary. */
export function utf8Truncate(text: string, maxBytes = MAX_MEMO_BYTES): string {
  const bytes = utf8Bytes(text);
  if (bytes.length <= maxBytes) return text;
  const slice = bytes.slice(0, maxBytes);
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let decoded = decoder.decode(slice);
  // Drop a trailing replacement character if we cut mid-sequence.
  if (decoded.endsWith('\uFFFD')) decoded = decoded.slice(0, -1);
  // Re-encode and shrink until the byte length is within the cap (handles
  // a replaced-or-partial code point and leftover continuation bytes).
  let out = utf8Bytes(decoded);
  while (out.length > maxBytes && decoded.length > 0) {
    decoded = decoded.slice(0, -1);
    out = utf8Bytes(decoded);
  }
  return decoded;
}

export function encodePush(data: Uint8Array): Uint8Array {
  if (data.length <= 75) {
    const out = new Uint8Array(1 + data.length);
    out[0] = data.length;
    out.set(data, 1);
    return out;
  }
  if (data.length <= 255) {
    const out = new Uint8Array(2 + data.length);
    out[0] = OP_PUSHDATA1;
    out[1] = data.length;
    out.set(data, 2);
    return out;
  }
  if (data.length <= 0xffff) {
    const out = new Uint8Array(3 + data.length);
    out[0] = OP_PUSHDATA2;
    out[1] = data.length & 0xff;
    out[2] = (data.length >> 8) & 0xff;
    out.set(data, 3);
    return out;
  }
  throw new Error('Push is larger than 65535 bytes.');
}

export function encodeOpReturn(data: Uint8Array): Uint8Array {
  if (data.length === 0) throw new Error('OP_RETURN payload must not be empty.');
  const push = encodePush(data);
  const out = new Uint8Array(1 + push.length);
  out[0] = OP_RETURN;
  out.set(push, 1);
  return out;
}

export type DecodedPush = {
  opcode: number;
  declaredLength: number;
  payload: Uint8Array;
  headerBytes: number;
  correct: boolean;
};

export function decodePush(script: Uint8Array, offset = 0): DecodedPush | { error: string } {
  if (offset >= script.length) return { error: 'No push bytes.' };
  const opcode = script[offset]!;
  if (opcode > 0 && opcode <= 75) {
    const declaredLength = opcode;
    const headerBytes = 1;
    const payload = script.slice(offset + headerBytes, offset + headerBytes + declaredLength);
    return {
      opcode,
      declaredLength,
      payload,
      headerBytes,
      correct: payload.length === declaredLength && offset + headerBytes + declaredLength === script.length,
    };
  }
  if (opcode === OP_PUSHDATA1) {
    if (offset + 2 > script.length) return { error: 'Truncated PUSHDATA1.' };
    const declaredLength = script[offset + 1]!;
    const headerBytes = 2;
    const payload = script.slice(offset + headerBytes, offset + headerBytes + declaredLength);
    return {
      opcode,
      declaredLength,
      payload,
      headerBytes,
      correct: payload.length === declaredLength && offset + headerBytes + declaredLength === script.length,
    };
  }
  if (opcode === OP_PUSHDATA2) {
    if (offset + 3 > script.length) return { error: 'Truncated PUSHDATA2.' };
    const declaredLength = script[offset + 1]! + (script[offset + 2]! << 8);
    const headerBytes = 3;
    const payload = script.slice(offset + headerBytes, offset + headerBytes + declaredLength);
    return {
      opcode,
      declaredLength,
      payload,
      headerBytes,
      correct: payload.length === declaredLength && offset + headerBytes + declaredLength === script.length,
    };
  }
  return { error: `Not a data-push opcode: 0x${opcode.toString(16)}` };
}

export function decodeOpReturn(script: Uint8Array): { payload: Uint8Array; push: DecodedPush } | { error: string } {
  if (script.length === 0 || script[0] !== OP_RETURN) return { error: 'Script is not OP_RETURN.' };
  const push = decodePush(script, 1);
  if ('error' in push) return push;
  if (!push.correct) return { error: 'OP_RETURN push length does not match the payload.' };
  return { payload: push.payload, push };
}

export function memoToScript(memo: string, maxBytes = MAX_MEMO_BYTES): Uint8Array | null {
  const trimmed = utf8Truncate(memo, maxBytes);
  const bytes = utf8Bytes(trimmed);
  if (bytes.length === 0) return null;
  return encodeOpReturn(bytes);
}
