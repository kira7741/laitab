import { binToHex, hexToBin, swapEndianness } from '@bitauth/libauth/build/lib/format/hex.js';
import { cashAddressToLockingBytecode, decodeCashAddress } from '@bitauth/libauth';
import type { Network } from './types';
import {
  decodeBroadcastTxResponse,
  decodeChronikTx,
  decodeScriptUtxos,
  encodeBroadcastTxRequest,
  isProbablyJson,
  type DecodedChronikUtxoSet,
} from './chronik-proto';
import {
  CHIPNET_ELECTRUM,
  MAINNET_ELECTRUM,
  electrumBroadcast,
  electrumGetTransaction,
  electrumListUnspent,
  isElectrumEnabled,
  withElectrum,
  type ElectrumCoin,
  type ElectrumHost,
} from './electrum';

/** Explorer / RPC display txid: hex of the reversed double-SHA256. */
export type DisplayTxid = string;

export type Utxo = {
  /** Explorer-display txid (64 hex, not wire order). */
  txid: DisplayTxid;
  vout: number;
  satoshis: bigint;
  /**
   * libauth structured outpointTransactionHash: display-order bytes.
   * The installed encoder reverses this for the Bitcoin wire format.
   */
  outpointHash: Uint8Array;
  lockingBytecode?: Uint8Array;
  hasToken?: boolean;
  /** HD path used when this coin was collected from a WizardConnect account. */
  path?: { name: string; index: number };
};

export type IndexerStatus = {
  ok: boolean;
  source: string;
  error?: string;
  skippedTokens?: number;
  /** Why a lookup failed, when it failed. */
  reason?: 'offline' | 'api-error' | 'empty' | 'ok';
};

const TXID_RE = /^[0-9a-f]{64}$/;
const MAX_VOUT = 0xffffffff;
/** 21 million BCH in satoshis. */
export const MAX_SATOSHIS = 2_100_000_000_000_000n;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

let fetcher: FetchLike = (url, init) => fetch(url, init);

/** Inject a fetch implementation for tests. Pass `null` to restore. */
export function setIndexerFetch(fn: FetchLike | null): void {
  fetcher = fn ?? ((url, init) => fetch(url, init));
}

function cleanTxid(txid: string): string {
  return txid.replace(/^0x/, '').toLowerCase().trim();
}

export function isDisplayTxid(txid: string): boolean {
  return TXID_RE.test(cleanTxid(txid));
}

/**
 * Build a UTXO from an explorer-display txid.
 * Do not pass wire-order (already-reversed) hex here.
 */
export function toUtxo(
  txid: string,
  vout: number,
  satoshis: bigint,
  extra?: Partial<Pick<Utxo, 'lockingBytecode' | 'hasToken' | 'path'>>,
): Utxo {
  const clean = cleanTxid(txid);
  return {
    txid: clean,
    vout,
    satoshis,
    outpointHash: hexToBin(clean),
    ...extra,
  };
}

/** Convert a wire-order (internal) 32-byte hash hex into a UTXO. */
export function toUtxoFromWireHash(
  wireTxidHex: string,
  vout: number,
  satoshis: bigint,
  extra?: Partial<Pick<Utxo, 'lockingBytecode' | 'hasToken' | 'path'>>,
): Utxo {
  const display = swapEndianness(cleanTxid(wireTxidHex));
  return toUtxo(display, vout, satoshis, extra);
}

export function wireHashHex(utxo: Utxo): string {
  return binToHex(utxo.outpointHash.slice().reverse());
}

export type UtxoValidationError = { error: string };

export function validateUtxoShape(
  txid: unknown,
  vout: unknown,
  satoshis: unknown,
): { txid: string; vout: number; satoshis: bigint } | UtxoValidationError {
  if (typeof txid !== 'string' || !isDisplayTxid(txid)) {
    return { error: 'Each unspent output needs a 64-character transaction id.' };
  }
  if (typeof vout === 'string' && vout.trim() !== '' && !/^\d+$/.test(vout.trim())) {
    return { error: 'The output index must be a whole number of 0 or more.' };
  }
  const voutNum = typeof vout === 'number' ? vout : Number(vout);
  if (!Number.isInteger(voutNum) || voutNum < 0 || voutNum > MAX_VOUT) {
    return { error: 'The output index must be a whole number between 0 and 4294967295.' };
  }
  let sats: bigint;
  try {
    if (typeof satoshis === 'bigint') sats = satoshis;
    else if (typeof satoshis === 'number') {
      if (!Number.isInteger(satoshis)) return { error: 'Satoshis must be a whole number.' };
      sats = BigInt(satoshis);
    } else if (typeof satoshis === 'string' && /^-?\d+$/.test(satoshis.trim())) {
      sats = BigInt(satoshis.trim());
    } else {
      return { error: 'Satoshis must be a whole number.' };
    }
  } catch {
    return { error: 'Satoshis must be a whole number.' };
  }
  if (sats <= 0n) return { error: 'Satoshis must be greater than zero.' };
  if (sats > MAX_SATOSHIS) return { error: 'Satoshis exceed the 21 million BCH supply.' };
  return { txid: cleanTxid(txid), vout: voutNum, satoshis: sats };
}

export function outpointKey(u: Pick<Utxo, 'txid' | 'vout'>): string {
  return `${u.txid}:${u.vout}`;
}

export function findDuplicateOutpoints(utxos: Utxo[]): string | null {
  const seen = new Set<string>();
  for (const u of utxos) {
    const key = outpointKey(u);
    if (seen.has(key)) return key;
    seen.add(key);
  }
  return null;
}

export function rejectTokenUtxos(utxos: Utxo[]): { spendable: Utxo[]; skippedTokens: number } {
  const spendable = utxos.filter((u) => !u.hasToken);
  return { spendable, skippedTokens: utxos.length - spendable.length };
}

function lockingForAddress(address: string): Uint8Array | undefined {
  const result = cashAddressToLockingBytecode(address);
  if (typeof result === 'string') return undefined;
  return result.bytecode;
}

export function attachLockingBytecode(utxos: Utxo[], address: string): Utxo[] {
  const lockingBytecode = lockingForAddress(address);
  if (!lockingBytecode) return utxos;
  return utxos.map((u) => ({ ...u, lockingBytecode }));
}

async function tryFetch(url: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetcher(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(8000) });
  } catch {
    return null;
  }
}

export function p2pkhPayloadHex(address: string): string | null {
  const decoded = decodeCashAddress(address);
  if (typeof decoded === 'string') return null;
  if (decoded.type !== 'p2pkh' && decoded.type !== 'p2pkhWithTokens') return null;
  return binToHex(decoded.payload);
}

type ParsedRemote = { utxos: Utxo[]; skippedTokens: number };

function hasTokenField(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const rec = value as { token?: unknown; token_id?: unknown; tokenId?: unknown; slp?: unknown };
  return Boolean(rec.token || rec.token_id || rec.tokenId || rec.slp);
}

/** Chronik JSON (client-style): outpoint.txid is explorer-display hex. */
export function parseChronikUtxos(body: unknown): ParsedRemote | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Chronik response was not an object.' };
  const list = Array.isArray(body)
    ? body
    : ((body as { utxos?: unknown }).utxos ?? (body as { output?: unknown }).output);
  if (!Array.isArray(list)) return { error: 'Chronik response had no utxos array.' };
  const utxos: Utxo[] = [];
  let skippedTokens = 0;
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const rec = raw as {
      outpoint?: { txid?: string; outIdx?: number; vout?: number };
      txid?: string;
      vout?: number;
      outIdx?: number;
      sats?: string | number | bigint;
      value?: string | number;
      token?: unknown;
    };
    if (hasTokenField(rec)) {
      skippedTokens += 1;
      continue;
    }
    const txid = rec.outpoint?.txid ?? rec.txid;
    const vout = rec.outpoint?.outIdx ?? rec.outpoint?.vout ?? rec.vout ?? rec.outIdx;
    const sats = rec.sats ?? rec.value;
    const checked = validateUtxoShape(txid, vout, sats);
    if ('error' in checked) return { error: `Chronik UTXO rejected: ${checked.error}` };
    utxos.push(toUtxo(checked.txid, checked.vout, checked.satoshis));
  }
  return { utxos, skippedTokens };
}

/** Esplora / electrs JSON: [{txid, vout, value}] with display txids and satoshi values. */
export function parseEsploraUtxos(body: unknown): ParsedRemote | { error: string } {
  if (!Array.isArray(body)) return { error: 'Esplora response was not a list.' };
  const utxos: Utxo[] = [];
  let skippedTokens = 0;
  for (const raw of body) {
    if (!raw || typeof raw !== 'object') continue;
    const rec = raw as {
      txid?: string;
      vout?: number;
      value?: number | string;
      status?: unknown;
      token?: unknown;
    };
    if (hasTokenField(rec)) {
      skippedTokens += 1;
      continue;
    }
    const checked = validateUtxoShape(rec.txid, rec.vout, rec.value);
    if ('error' in checked) return { error: `Explorer UTXO rejected: ${checked.error}` };
    utxos.push(toUtxo(checked.txid, checked.vout, checked.satoshis));
  }
  return { utxos, skippedTokens };
}

export function parseBlockchairUtxos(body: unknown): ParsedRemote | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Blockchair response was not an object.' };
  const data = (body as { data?: Record<string, { utxo?: unknown[] }> }).data ?? {};
  const key = Object.keys(data)[0];
  const list = (key ? data[key]?.utxo : undefined) ?? [];
  if (!Array.isArray(list)) return { error: 'Blockchair response had no utxo list.' };
  const utxos: Utxo[] = [];
  let skippedTokens = 0;
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const rec = raw as {
      spending_transaction?: string;
      transaction_hash?: string;
      index?: number;
      value?: number;
      token?: unknown;
    };
    if (rec.spending_transaction) continue;
    if (hasTokenField(rec)) {
      skippedTokens += 1;
      continue;
    }
    const checked = validateUtxoShape(rec.transaction_hash, rec.index, rec.value);
    if ('error' in checked) return { error: `Blockchair UTXO rejected: ${checked.error}` };
    utxos.push(toUtxo(checked.txid, checked.vout, checked.satoshis));
  }
  return { utxos, skippedTokens };
}

/**
 * Documented Bitcoin Cash Chronik HTTP bases. Official Chronik HTTP is protobuf.
 * These are BCH paths, not eCash `/xec` (which would query the wrong chain).
 *
 * `https://bch.paybutton.io` is the current bitcoincash Chronik URL in PayButton
 * (https://github.com/PayButton/paybutton-server/pull/1010). This environment
 * received protobuf 200s from `/blockchain-info` and `/chronik-info` on
 * 18 November 2026 (HKT).
 *
 * `https://chronik.pay2stay.com/bch` is the earlier documented PayButton URL
 * (https://github.com/PayButton/paybutton-server/pull/843). It returned HTTP 502
 * from this environment on the same day and is kept only as a documented fallback.
 *
 * No documented live Chipnet *Bitcoin Cash* Chronik HTTP endpoint was found.
 */
export const MAINNET_CHRONIK = ['https://bch.paybutton.io', 'https://chronik.pay2stay.com/bch'];
export const CHIPNET_CHRONIK: string[] = [];

/** chipnet.imaginary.cash is a web explorer, not an Esplora `/api` server. */
export const CHIPNET_ESPLORA: string[] = [];

export const BLOCKCHAIR_ADDRESS = 'https://api.blockchair.com/bitcoin-cash/dashboards/address';
export const BLOCKCHAIR_TX = 'https://api.blockchair.com/bitcoin-cash/dashboards/transaction';
export const BLOCKCHAIR_PUSH = 'https://api.blockchair.com/bitcoin-cash/push/transaction';

export function chronikBases(network: Network): string[] {
  return network === 'chipnet' ? CHIPNET_CHRONIK : MAINNET_CHRONIK;
}

export function electrumHosts(network: Network): ElectrumHost[] {
  return network === 'chipnet' ? CHIPNET_ELECTRUM : MAINNET_ELECTRUM;
}

/**
 * Fetch UTXOs for a CashAddr. Public indexers are best-effort: the UI must
 * still work with BIP21 invoices and a manual UTXO entry if every server is
 * unreachable from the user's browser.
 *
 * Official Chronik HTTP is protobuf and is decoded by `chronik-proto`.
 * JSON bodies are still accepted if a gateway returns them. Chipnet has no
 * documented Chronik HTTP base in this package; it uses documented Fulcrum
 * WebSocket servers when enabled, then the same paste/BIP21 fallback.
 */
export async function fetchUtxos(
  address: string,
  network: Network,
): Promise<{ utxos: Utxo[]; status: IndexerStatus }> {
  const locking = lockingForAddress(address);
  const decorate = (parsed: ParsedRemote, source: string): { utxos: Utxo[]; status: IndexerStatus } => {
    const utxos = locking
      ? parsed.utxos.map((u) => ({ ...u, lockingBytecode: locking }))
      : parsed.utxos;
    return {
      utxos,
      status: {
        ok: true,
        source,
        skippedTokens: parsed.skippedTokens,
        reason: utxos.length === 0 ? 'empty' : 'ok',
      },
    };
  };

  const payload = p2pkhPayloadHex(address);

  for (const base of chronikBases(network)) {
    if (!payload) break;
    const url = `${base}/script/p2pkh/${payload}/utxos`;
    const parsed = await getChronikUtxos(url);
    if (parsed && !('error' in parsed)) return decorate(parsed, `chronik:${base}`);
  }

  if (network === 'mainnet') {
    const chair = await getJson(
      `${BLOCKCHAIR_ADDRESS}/${encodeURIComponent(address)}?limit=100`,
      parseBlockchairUtxos,
    );
    if (chair && !('error' in chair)) return decorate(chair, 'blockchair');
  }

  if (isElectrumEnabled()) {
    for (const host of electrumHosts(network)) {
      try {
        const listed = await withElectrum(host.url, (rpc) => electrumListUnspent(rpc, address));
        if (!('error' in listed)) {
          const converted = coinsToParsed(listed.coins, listed.skippedTokens);
          if (!('error' in converted)) return decorate(converted, `electrum:${host.label}`);
        }
      } catch {
        /* try the next documented host, then fall through to the honest fallback */
      }
    }
  }

  return {
    utxos: [],
    status: {
      ok: false,
      source: 'none',
      reason: 'api-error',
      error:
        'No public indexer replied with usable UTXOs from this browser. Paste the unspent output from an explorer, or pay with a BIP21 invoice in a Bitcoin Cash wallet.',
    },
  };
}

function coinsToParsed(
  coins: ElectrumCoin[] | DecodedChronikUtxoSet['utxos'],
  skippedTokens: number,
): ParsedRemote | { error: string } {
  const utxos: Utxo[] = [];
  for (const coin of coins) {
    const txid = 'displayTxid' in coin ? coin.displayTxid : coin.txid;
    const vout = coin.vout;
    const sats = 'sats' in coin ? coin.sats : coin.satoshis;
    const checked = validateUtxoShape(txid, vout, sats);
    if ('error' in checked) return { error: checked.error };
    utxos.push(toUtxo(checked.txid, checked.vout, checked.satoshis));
  }
  const dup = findDuplicateOutpoints(utxos);
  if (dup) return { error: `Duplicate unspent output: ${dup}.` };
  return { utxos, skippedTokens };
}

type RawBody = { ok: boolean; status: number; contentType: string; bytes: Uint8Array };

async function getRaw(url: string, init?: RequestInit): Promise<RawBody | null> {
  const res = await tryFetch(url, init);
  if (!res) return null;
  try {
    const bytes = new Uint8Array(await res.arrayBuffer());
    return {
      ok: res.ok,
      status: res.status,
      contentType: res.headers.get('content-type') ?? '',
      bytes,
    };
  } catch {
    return null;
  }
}

function isProtobufType(contentType: string, bytes: Uint8Array): boolean {
  if (contentType.includes('application/x-protobuf') || contentType.includes('application/octet-stream')) return true;
  return bytes.length > 0 && !isProbablyJson(bytes);
}

async function getChronikUtxos(url: string): Promise<ParsedRemote | { error: string } | null> {
  const raw = await getRaw(url, { headers: { Accept: 'application/x-protobuf, application/json' } });
  if (!raw || !raw.ok || raw.bytes.length === 0) return null;
  if (isProbablyJson(raw.bytes)) {
    try {
      const parsed = parseChronikUtxos(JSON.parse(new TextDecoder().decode(raw.bytes)));
      return 'error' in parsed ? null : parsed;
    } catch {
      return null;
    }
  }
  if (isProtobufType(raw.contentType, raw.bytes)) {
    const decoded = decodeScriptUtxos(raw.bytes);
    if ('error' in decoded) return null;
    return coinsToParsed(decoded.utxos, decoded.skippedTokens);
  }
  return null;
}

async function getJson<T>(
  url: string,
  parse: (body: unknown) => T | { error: string },
): Promise<T | { error: string } | null> {
  const raw = await getRaw(url, { headers: { Accept: 'application/json' } });
  if (!raw || !raw.ok) return null;
  if (!isProbablyJson(raw.bytes)) return null;
  try {
    return parse(JSON.parse(new TextDecoder().decode(raw.bytes)));
  } catch {
    return null;
  }
}

export type BroadcastResult = {
  txid?: string;
  error?: string;
  source: string;
  accepted: boolean;
};

export async function broadcastTx(hex: string, network: Network): Promise<BroadcastResult> {
  const raw = hex.trim().toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]+$/.test(raw) || raw.length < 200 || raw.length % 2 !== 0) {
    return { error: 'The signed transaction hex looks incomplete.', source: 'none', accepted: false };
  }

  const rawBytes = hexToBin(raw);
  const protoBody = encodeBroadcastTxRequest(rawBytes);

  for (const base of chronikBases(network)) {
    const res = await tryFetch(`${base}/tx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-protobuf', Accept: 'application/x-protobuf, application/json, text/plain' },
      body: protoBody.buffer.slice(protoBody.byteOffset, protoBody.byteOffset + protoBody.byteLength) as ArrayBuffer,
    });
    const parsed = await readChronikBroadcast(res);
    if (parsed.accepted) return { ...parsed, source: `chronik:${base}` };
  }

  if (network === 'mainnet') {
    const res = await tryFetch(BLOCKCHAIR_PUSH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: raw }),
    });
    if (res && res.ok) {
      try {
        const body = await res.json();
        const txid = body.data?.transaction_hash as string | undefined;
        if (txid && isDisplayTxid(txid)) return { txid: cleanTxid(txid), source: 'blockchair', accepted: true };
      } catch {
        /* fall through */
      }
    }
  }

  if (isElectrumEnabled()) {
    for (const host of electrumHosts(network)) {
      try {
        const pushed = await withElectrum(host.url, (rpc) => electrumBroadcast(rpc, raw));
        if (!('error' in pushed)) return { txid: pushed.txid, source: `electrum:${host.label}`, accepted: true };
      } catch {
        /* try the next host */
      }
    }
  }

  return {
    error:
      'Automatic broadcast was not available. Copy the signed hex and push it from a wallet or explorer. This transaction is signed, not yet accepted by the network.',
    source: 'none',
    accepted: false,
  };
}

async function readChronikBroadcast(res: Response | null): Promise<BroadcastResult> {
  if (!res) return { source: 'none', accepted: false, error: 'offline' };
  try {
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (isProbablyJson(bytes) || (res.headers.get('content-type') ?? '').includes('application/json')) {
      const jsonParsed = await readBroadcastText(new TextDecoder().decode(bytes), res.ok);
      if (jsonParsed.accepted) return jsonParsed;
    }
    const decoded = decodeBroadcastTxResponse(bytes);
    if (!('error' in decoded)) return { txid: decoded.txid, source: 'chronik', accepted: true };
    if (!res.ok) return { source: 'none', accepted: false, error: decoded.error ?? `HTTP ${res.status}` };
    return { source: 'none', accepted: false, error: decoded.error };
  } catch {
    return { source: 'none', accepted: false, error: res.ok ? 'Broadcast reply had no transaction id.' : `HTTP ${res.status}` };
  }
}

function readBroadcastText(text: string, ok: boolean): BroadcastResult {
  const trimmed = text.trim();
  if (ok && isDisplayTxid(trimmed)) return { txid: cleanTxid(trimmed), source: 'body', accepted: true };
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const body = JSON.parse(trimmed) as { txid?: string; transaction_hash?: string; data?: { transaction_hash?: string } };
      const txid = body.txid ?? body.transaction_hash ?? body.data?.transaction_hash;
      if (txid && isDisplayTxid(txid)) return { txid: cleanTxid(txid), source: 'body', accepted: true };
    } catch {
      /* fall through */
    }
  }
  return { source: 'none', accepted: false, error: ok ? 'Broadcast reply had no transaction id.' : `HTTP error` };
}

export type FetchedTx = {
  txid: string;
  outputs: { index: number; satoshis: bigint; lockingBytecodeHex?: string; address?: string }[];
  source: string;
};

export async function fetchTransaction(txid: string, network: Network): Promise<FetchedTx | { error: string }> {
  const clean = cleanTxid(txid);
  if (!isDisplayTxid(clean)) return { error: 'Transaction id must be 64 hexadecimal characters.' };

  for (const base of chronikBases(network)) {
    const raw = await getRaw(`${base}/tx/${clean}`, { headers: { Accept: 'application/x-protobuf, application/json' } });
    if (raw && raw.ok && raw.bytes.length) {
      if (isProbablyJson(raw.bytes)) {
        try {
          const parsed = parseChronikTx(clean, JSON.parse(new TextDecoder().decode(raw.bytes)));
          if (parsed) return { ...parsed, source: `chronik:${base}` };
        } catch {
          /* try protobuf */
        }
      } else {
        const decoded = decodeChronikTx(raw.bytes);
        if (!('error' in decoded)) return { ...decoded, source: `chronik:${base}` };
      }
    }
  }

  if (network === 'mainnet') {
    const body = await getJson(`${BLOCKCHAIR_TX}/${clean}`, (raw) => raw);
    if (body) {
      const parsed = parseBlockchairTx(clean, body);
      if (parsed) return { ...parsed, source: 'blockchair' };
    }
  }

  if (isElectrumEnabled()) {
    for (const host of electrumHosts(network)) {
      try {
        const looked = await withElectrum(host.url, (rpc) => electrumGetTransaction(rpc, clean));
        if (!('error' in looked)) return { ...looked, source: `electrum:${host.label}` };
      } catch {
        /* try the next host */
      }
    }
  }

  return { error: 'Could not look up that transaction on a public indexer.' };
}

function parseChronikTx(txid: string, body: unknown): Omit<FetchedTx, 'source'> | null {
  if (!body || typeof body !== 'object') return null;
  const outputs = (body as { outputs?: unknown[]; vout?: unknown[] }).outputs ?? (body as { vout?: unknown[] }).vout;
  if (!Array.isArray(outputs)) return null;
  const parsed = outputs.map((raw, index) => {
    const rec = raw as {
      sats?: string | number;
      value?: string | number;
      outputScript?: string;
      scriptPubKey?: { hex?: string; addresses?: string[]; address?: string };
      lockingBytecode?: string;
      address?: string;
    };
    const sats =
      typeof rec.sats === 'string' || typeof rec.sats === 'number'
        ? BigInt(rec.sats)
        : typeof rec.value === 'string' || typeof rec.value === 'number'
          ? BigInt(rec.value)
          : 0n;
    return {
      index,
      satoshis: sats,
      lockingBytecodeHex: rec.outputScript ?? rec.lockingBytecode ?? rec.scriptPubKey?.hex,
      address: rec.address ?? rec.scriptPubKey?.address ?? rec.scriptPubKey?.addresses?.[0],
    };
  });
  return { txid, outputs: parsed.map(({ index, satoshis, lockingBytecodeHex, address }) => ({ index, satoshis, lockingBytecodeHex, address })) };
}

export function parseEsploraTx(txid: string, body: unknown): Omit<FetchedTx, 'source'> | null {
  if (!body || typeof body !== 'object') return null;
  const outputs = (body as { vout?: unknown[] }).vout;
  if (!Array.isArray(outputs)) return null;
  return {
    txid,
    outputs: outputs.map((raw, index) => {
      const rec = raw as { value?: number; scriptpubkey?: string; scriptpubkey_address?: string };
      return {
        index,
        satoshis: BigInt(rec.value ?? 0),
        lockingBytecodeHex: rec.scriptpubkey,
        address: rec.scriptpubkey_address,
      };
    }),
  };
}

function parseBlockchairTx(txid: string, body: unknown): Omit<FetchedTx, 'source'> | null {
  if (!body || typeof body !== 'object') return null;
  const data = (body as { data?: Record<string, { outputs?: unknown[] }> }).data ?? {};
  const key = Object.keys(data)[0];
  const outputs = key ? data[key]?.outputs : undefined;
  if (!Array.isArray(outputs)) return null;
  return {
    txid,
    outputs: outputs.map((raw, index) => {
      const rec = raw as { value?: number; recipient?: string; script_hex?: string };
      return {
        index,
        satoshis: BigInt(rec.value ?? 0),
        lockingBytecodeHex: rec.script_hex,
        address: rec.recipient,
      };
    }),
  };
}

export function utxoSum(utxos: Utxo[]): bigint {
  return utxos.reduce((acc, u) => acc + u.satoshis, 0n);
}

/** Accept JSON or lines of `txid:vout:satoshis`. Never throws on bad input. */
export function parseManualUtxos(text: string): { utxos: Utxo[] } | { error: string } {
  const raw = text.trim();
  if (!raw) return { error: 'Paste at least one unspent output.' };
  try {
    if (raw.startsWith('[') || raw.startsWith('{')) {
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch (err) {
        return { error: `Could not parse JSON UTXOs: ${err instanceof Error ? err.message : String(err)}` };
      }
      const rec = data as { utxos?: unknown; utxo?: unknown };
      const list = Array.isArray(data) ? data : rec.utxos ?? rec.utxo ?? [];
      if (!Array.isArray(list) || list.length === 0) return { error: 'JSON must contain a list of unspent outputs.' };
      const utxos: Utxo[] = [];
      for (const item of list) {
        if (!item || typeof item !== 'object') return { error: 'Each JSON unspent output must be an object.' };
        const u = item as {
          txid?: unknown;
          transaction_hash?: unknown;
          vout?: unknown;
          index?: unknown;
          satoshis?: unknown;
          value?: unknown;
          sats?: unknown;
          token?: unknown;
        };
        if (hasTokenField(u)) {
          return { error: 'A pasted output carries a token and will not be spent, to avoid burning CashTokens.' };
        }
        const checked = validateUtxoShape(u.txid ?? u.transaction_hash, u.vout ?? u.index ?? 0, u.satoshis ?? u.sats ?? u.value);
        if ('error' in checked) return checked;
        utxos.push(toUtxo(checked.txid, checked.vout, checked.satoshis));
      }
      const dup = findDuplicateOutpoints(utxos);
      if (dup) return { error: `Duplicate unspent output: ${dup}.` };
      return { utxos };
    }
  } catch (err) {
    return { error: `Could not parse JSON UTXOs: ${err instanceof Error ? err.message : String(err)}` };
  }
  const utxos: Utxo[] = [];
  for (const line of raw.split(/\n+/)) {
    const t = line.trim();
    if (!t) continue;
    const parts = t.split(/[,:\s]+/);
    if (parts.length < 3) return { error: 'Each line should be txid:vout:satoshis.' };
    const [txid, vout, sats] = parts;
    const checked = validateUtxoShape(txid, vout, sats);
    if ('error' in checked) return checked;
    utxos.push(toUtxo(checked.txid, checked.vout, checked.satoshis));
  }
  if (!utxos.length) return { error: 'No unspent outputs parsed.' };
  const dup = findDuplicateOutpoints(utxos);
  if (dup) return { error: `Duplicate unspent output: ${dup}.` };
  return { utxos };
}
