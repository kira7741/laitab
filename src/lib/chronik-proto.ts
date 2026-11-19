/**
 * Official Chronik HTTP is protobuf, not JSON.
 * Field numbers and txid endianness follow chronik-client 4.4.0
 * (MIT, The Bitcoin developers): protobuf txid bytes are wire/internal
 * order; explorer-display hex is the byte reversal (`toHexRev`).
 */
import { binToHex, hexToBin } from '@bitauth/libauth/build/lib/format/hex.js';
import { ProtoReader, ProtoWriter } from './protobuf-lite';

export type DecodedChronikUtxo = {
  displayTxid: string;
  vout: number;
  sats: bigint;
  hasToken: boolean;
};

export type DecodedChronikUtxoSet = {
  utxos: DecodedChronikUtxo[];
  skippedTokens: number;
};

export type DecodedChronikTx = {
  txid: string;
  outputs: { index: number; satoshis: bigint; lockingBytecodeHex?: string }[];
};

export function isProbablyJson(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length; i += 1) {
    const c = bytes[i]!;
    if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) continue;
    return c === 0x7b || c === 0x5b;
  }
  return false;
}

export function displayTxidFromChronikBytes(txid: Uint8Array): string | null {
  if (txid.length !== 32) return null;
  return binToHex(txid.slice().reverse());
}

export function chronikBytesFromDisplayTxid(display: string): Uint8Array {
  return hexToBin(display).slice().reverse();
}

function readOutPoint(reader: ProtoReader): { txid: Uint8Array; outIdx: number } | { error: string } {
  let txid: Uint8Array | null = null;
  let outIdx = 0;
  while (reader.remaining > 0) {
    const tag = reader.tag();
    if (!tag) break;
    if (tag.field === 1 && tag.wire === 2) txid = reader.bytes();
    else if (tag.field === 2 && tag.wire === 0) outIdx = reader.int32();
    else reader.skip(tag.wire);
  }
  if (!txid) return { error: 'Chronik outpoint was missing a transaction id.' };
  return { txid, outIdx };
}

type RawUtxo = { txidBytes: Uint8Array; vout: number; sats: bigint; hasToken: boolean };

/** ScriptUtxo: field 5 is `sats` (field 4 is reserved after the value→sats rename). */
function readScriptUtxo(reader: ProtoReader): RawUtxo | { error: string } {
  let txidBytes: Uint8Array | null = null;
  let vout = 0;
  let sats = 0n;
  let hasToken = false;
  while (reader.remaining > 0) {
    const tag = reader.tag();
    if (!tag) break;
    if (tag.field === 1 && tag.wire === 2) {
      const op = readOutPoint(new ProtoReader(reader.bytes()));
      if ('error' in op) return op;
      txidBytes = op.txid;
      vout = op.outIdx;
    } else if (tag.field === 5 && tag.wire === 0) {
      sats = reader.int64();
    } else if (tag.field === 11 && tag.wire === 2) {
      hasToken = true;
      reader.bytes();
    } else {
      reader.skip(tag.wire);
    }
  }
  if (!txidBytes) return { error: 'Chronik UTXO was missing an outpoint.' };
  return { txidBytes, vout, sats, hasToken };
}

function collect(raws: RawUtxo[]): DecodedChronikUtxoSet | { error: string } {
  const utxos: DecodedChronikUtxo[] = [];
  let skippedTokens = 0;
  for (const raw of raws) {
    if (raw.hasToken) {
      skippedTokens += 1;
      continue;
    }
    const displayTxid = displayTxidFromChronikBytes(raw.txidBytes);
    if (!displayTxid) return { error: 'Chronik UTXO transaction id was not 32 bytes.' };
    utxos.push({ displayTxid, vout: raw.vout, sats: raw.sats, hasToken: false });
  }
  return { utxos, skippedTokens };
}

/** GET /script/p2pkh/<payload>/utxos → ScriptUtxos. */
export function decodeScriptUtxos(bytes: Uint8Array): DecodedChronikUtxoSet | { error: string } {
  try {
    const reader = new ProtoReader(bytes);
    const raws: RawUtxo[] = [];
    while (reader.remaining > 0) {
      const tag = reader.tag();
      if (!tag) break;
      if (tag.field === 2 && tag.wire === 2) {
        const item = readScriptUtxo(new ProtoReader(reader.bytes()));
        if ('error' in item) return item;
        raws.push(item);
      } else {
        reader.skip(tag.wire);
      }
    }
    return collect(raws);
  } catch (err) {
    return { error: `Could not decode Chronik UTXO protobuf: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export function decodeChronikError(bytes: Uint8Array): string | null {
  try {
    const reader = new ProtoReader(bytes);
    let msg: string | null = null;
    while (reader.remaining > 0) {
      const tag = reader.tag();
      if (!tag) break;
      if (tag.field === 2 && tag.wire === 2) msg = reader.string();
      else reader.skip(tag.wire);
    }
    return msg && msg.trim() ? msg : null;
  } catch {
    return null;
  }
}

export function encodeBroadcastTxRequest(rawTx: Uint8Array, skipTokenChecks = false): Uint8Array {
  const w = new ProtoWriter();
  w.bytes(1, rawTx);
  w.bool(2, skipTokenChecks);
  return w.finish();
}

export function decodeBroadcastTxResponse(bytes: Uint8Array): { txid: string } | { error: string } {
  try {
    const reader = new ProtoReader(bytes);
    let txidBytes: Uint8Array | null = null;
    let msg: string | null = null;
    while (reader.remaining > 0) {
      const tag = reader.tag();
      if (!tag) break;
      if (tag.field === 1 && tag.wire === 2) txidBytes = reader.bytes();
      else if (tag.field === 2 && tag.wire === 2) msg = reader.string();
      else reader.skip(tag.wire);
    }
    if (txidBytes) {
      const txid = displayTxidFromChronikBytes(txidBytes);
      if (!txid) return { error: 'Chronik broadcast reply had a short transaction id.' };
      return { txid };
    }
    if (msg) return { error: msg };
    return { error: 'Chronik broadcast reply had no transaction id.' };
  } catch (e) {
    return { error: `Could not decode Chronik broadcast reply: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export function decodeChronikTx(bytes: Uint8Array): DecodedChronikTx | { error: string } {
  try {
    const reader = new ProtoReader(bytes);
    let txidBytes: Uint8Array | null = null;
    const outputs: DecodedChronikTx['outputs'] = [];
    while (reader.remaining > 0) {
      const tag = reader.tag();
      if (!tag) break;
      if (tag.field === 1 && tag.wire === 2) {
        txidBytes = reader.bytes();
      } else if (tag.field === 4 && tag.wire === 2) {
        const out = new ProtoReader(reader.bytes());
        let sats = 0n;
        let script: Uint8Array | undefined;
        while (out.remaining > 0) {
          const ot = out.tag();
          if (!ot) break;
          if (ot.field === 1 && ot.wire === 0) sats = out.int64();
          else if (ot.field === 2 && ot.wire === 2) script = out.bytes();
          else out.skip(ot.wire);
        }
        outputs.push({
          index: outputs.length,
          satoshis: sats,
          lockingBytecodeHex: script ? binToHex(script) : undefined,
        });
      } else {
        reader.skip(tag.wire);
      }
    }
    if (!txidBytes) return { error: 'Chronik transaction was missing a transaction id.' };
    const txid = displayTxidFromChronikBytes(txidBytes);
    if (!txid) return { error: 'Chronik transaction id was not 32 bytes.' };
    return { txid, outputs };
  } catch (err) {
    return { error: `Could not decode Chronik transaction protobuf: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Test helper: build a ScriptUtxos body with Chronik wire-order txids. */
export function encodeScriptUtxosFixture(
  items: { displayTxid: string; vout: number; sats: bigint; token?: boolean }[],
): Uint8Array {
  const w = new ProtoWriter();
  w.bytes(1, new Uint8Array([0x76, 0xa9, 0x14]));
  for (const item of items) {
    const outpoint = new ProtoWriter()
      .bytes(1, chronikBytesFromDisplayTxid(item.displayTxid))
      .uint(2, item.vout)
      .finish();
    const u = new ProtoWriter();
    u.message(1, outpoint);
    u.int64(5, item.sats);
    if (item.token) {
      u.message(11, new ProtoWriter().bytes(1, new TextEncoder().encode('token-id')).finish());
    }
    w.message(2, u.finish());
  }
  return w.finish();
}

export function encodeChronikTxFixture(opts: {
  displayTxid: string;
  outputs: { sats: bigint; scriptHex: string }[];
}): Uint8Array {
  const w = new ProtoWriter();
  w.bytes(1, chronikBytesFromDisplayTxid(opts.displayTxid));
  w.uint(2, 2);
  for (const o of opts.outputs) {
    const out = new ProtoWriter();
    out.int64(1, o.sats);
    out.bytes(2, hexToBin(o.scriptHex));
    w.message(4, out.finish());
  }
  return w.finish();
}

export function encodeChronikError(msg: string): Uint8Array {
  return new ProtoWriter().bytes(2, new TextEncoder().encode(msg)).finish();
}

export function encodeBroadcastTxResponse(displayTxid: string): Uint8Array {
  return new ProtoWriter().bytes(1, chronikBytesFromDisplayTxid(displayTxid)).finish();
}
