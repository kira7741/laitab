/**
 * Electrum Cash / Fulcrum JSON-RPC over WebSocket.
 * Hosts below are the documented Fulcrum endpoints cited on each entry.
 */
import { sha256, cashAddressToLockingBytecode, decodeTransaction, binToHex, hexToBin } from '@bitauth/libauth';

export type ElectrumHost = {
  url: string;
  label: string;
  documentedBy: string;
};

/**
 * Chipnet Fulcrum WSS. Imaginary.cash documents port 50004 as the wss port.
 * https://wiki.electroncash.de/wiki/Imaginary.cash
 */
export const CHIPNET_ELECTRUM: ElectrumHost[] = [
  {
    url: 'wss://chipnet.imaginary.cash:50004',
    label: 'chipnet.imaginary.cash',
    documentedBy: 'https://wiki.electroncash.de/wiki/Imaginary.cash',
  },
];

/**
 * Mainnet Fulcrum WSS. CashScript's ElectrumNetworkProvider defaults to
 * bch.imaginary.cash; the Imaginary.cash wiki documents wss port 50004.
 */
export const MAINNET_ELECTRUM: ElectrumHost[] = [
  {
    url: 'wss://bch.imaginary.cash:50004',
    label: 'bch.imaginary.cash',
    documentedBy:
      'https://cashscript.org/docs/sdk/electrum-network-provider and https://wiki.electroncash.de/wiki/Imaginary.cash',
  },
];

export type ElectrumCoin = {
  txid: string;
  vout: number;
  satoshis: bigint;
  hasToken: boolean;
};

export type ElectrumTx = {
  txid: string;
  outputs: { index: number; satoshis: bigint; lockingBytecodeHex?: string }[];
};

export function scriptHashFromLockingBytecode(locking: Uint8Array): string {
  return binToHex(sha256.hash(locking).slice().reverse());
}

export function scriptHashFromAddress(address: string): string | null {
  const locking = cashAddressToLockingBytecode(address);
  if (typeof locking === 'string') return null;
  return scriptHashFromLockingBytecode(locking.bytecode);
}

export type ElectrumRpc = {
  request(method: string, params: unknown[]): Promise<unknown>;
  close?: () => void;
};

export type ElectrumOpen = (url: string, timeoutMs: number) => Promise<ElectrumRpc>;

let opener: ElectrumOpen | null = null;
let electrumEnabled = true;

/** Inject a transport for tests. Pass `null` to restore the default WebSocket opener. */
export function setElectrumOpener(fn: ElectrumOpen | null): void {
  opener = fn;
}

/** Tests that must not open a live socket can disable Electrum entirely. */
export function setElectrumEnabled(enabled: boolean): void {
  electrumEnabled = enabled;
}

export function isElectrumEnabled(): boolean {
  return electrumEnabled;
}

type WsLike = {
  readyState: number;
  send: (data: string) => void;
  close: () => void;
  addEventListener: (type: string, fn: (ev: { data?: unknown }) => void) => void;
  onopen?: ((ev: unknown) => void) | null;
  onerror?: ((ev: unknown) => void) | null;
  onclose?: ((ev: unknown) => void) | null;
  onmessage?: ((ev: { data?: unknown }) => void) | null;
};

function openDefault(url: string, timeoutMs: number): Promise<ElectrumRpc> {
  const WS = (globalThis as { WebSocket?: new (url: string) => WsLike }).WebSocket;
  if (!WS) return Promise.reject(new Error('This environment has no WebSocket.'));
  return new Promise((resolve, reject) => {
    const ws = new WS(url);
    let nextId = 1;
    const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
    let opened = false;
    const timer = setTimeout(() => {
      if (!opened) {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        reject(new Error(`Electrum connection to ${url} timed out.`));
      }
    }, timeoutMs);

    const failAll = (err: Error) => {
      for (const p of pending.values()) p.reject(err);
      pending.clear();
    };

    const onMessage = (ev: { data?: unknown }) => {
      const raw =
        typeof ev.data === 'string'
          ? ev.data
          : ev.data instanceof ArrayBuffer
            ? new TextDecoder().decode(ev.data)
            : String(ev.data ?? '');
      for (const line of raw.split(/\n+/)) {
        const t = line.trim();
        if (!t) continue;
        let msg: { id?: number; result?: unknown; error?: { message?: string } | string };
        try {
          msg = JSON.parse(t) as typeof msg;
        } catch {
          continue;
        }
        if (typeof msg.id !== 'number') continue;
        const waiter = pending.get(msg.id);
        if (!waiter) continue;
        pending.delete(msg.id);
        if (msg.error) {
          const text = typeof msg.error === 'string' ? msg.error : msg.error.message ?? JSON.stringify(msg.error);
          waiter.reject(new Error(text));
        } else {
          waiter.resolve(msg.result);
        }
      }
    };

    const onOpen = () => {
      opened = true;
      clearTimeout(timer);
      resolve({
        request(method, params) {
          const id = nextId++;
          return new Promise((res, rej) => {
            pending.set(id, { resolve: res, reject: rej });
            try {
              ws.send(JSON.stringify({ id, method, params }) + '\n');
            } catch (err) {
              pending.delete(id);
              rej(err instanceof Error ? err : new Error(String(err)));
            }
          });
        },
        close() {
          failAll(new Error('Electrum connection closed.'));
          try {
            ws.close();
          } catch {
            /* ignore */
          }
        },
      });
    };

    const onError = () => {
      clearTimeout(timer);
      if (!opened) reject(new Error(`Electrum connection to ${url} failed.`));
      else failAll(new Error(`Electrum connection to ${url} failed.`));
    };

    if (typeof ws.addEventListener === 'function') {
      ws.addEventListener('open', onOpen);
      ws.addEventListener('error', onError);
      ws.addEventListener('message', onMessage);
      ws.addEventListener('close', () => failAll(new Error('Electrum connection closed.')));
    } else {
      ws.onopen = onOpen;
      ws.onerror = onError;
      ws.onmessage = onMessage;
      ws.onclose = () => failAll(new Error('Electrum connection closed.'));
    }
  });
}

export async function withElectrum<T>(url: string, fn: (rpc: ElectrumRpc) => Promise<T>, timeoutMs = 8000): Promise<T> {
  if (!electrumEnabled) throw new Error('Electrum is disabled in this test run.');
  const open = opener ?? openDefault;
  const rpc = await open(url, timeoutMs);
  try {
    return await fn(rpc);
  } finally {
    rpc.close?.();
  }
}

export function parseElectrumListUnspent(result: unknown): { coins: ElectrumCoin[]; skippedTokens: number } | { error: string } {
  if (!Array.isArray(result)) return { error: 'Electrum listunspent was not a list.' };
  const coins: ElectrumCoin[] = [];
  let skippedTokens = 0;
  for (const raw of result) {
    if (!raw || typeof raw !== 'object') continue;
    const rec = raw as {
      tx_hash?: unknown;
      txid?: unknown;
      tx_pos?: unknown;
      vout?: unknown;
      value?: unknown;
      token_data?: unknown;
      token?: unknown;
    };
    if (rec.token_data || rec.token) {
      skippedTokens += 1;
      continue;
    }
    const txid = typeof rec.tx_hash === 'string' ? rec.tx_hash : typeof rec.txid === 'string' ? rec.txid : '';
    const vout = rec.tx_pos ?? rec.vout ?? 0;
    const satoshis = rec.value;
    coins.push({
      txid,
      vout: typeof vout === 'number' ? vout : Number(vout),
      satoshis: typeof satoshis === 'bigint' ? satoshis : BigInt(String(satoshis)),
      hasToken: false,
    });
  }
  return { coins, skippedTokens };
}

export async function electrumListUnspent(
  rpc: ElectrumRpc,
  address: string,
): Promise<{ coins: ElectrumCoin[]; skippedTokens: number } | { error: string }> {
  const scriptHash = scriptHashFromAddress(address);
  if (!scriptHash) return { error: 'Could not derive an Electrum script hash from that address.' };
  try {
    let result: unknown;
    try {
      result = await rpc.request('blockchain.scripthash.listunspent', [scriptHash, { include_tokens: true }]);
    } catch {
      result = await rpc.request('blockchain.scripthash.listunspent', [scriptHash]);
    }
    return parseElectrumListUnspent(result);
  } catch (err) {
    return { error: `Electrum listunspent failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export function parseElectrumRawTransaction(txid: string, raw: unknown): ElectrumTx | { error: string } {
  if (typeof raw !== 'string' || !/^[0-9a-f]+$/i.test(raw.trim()) || raw.trim().length % 2 !== 0) {
    return { error: 'Electrum did not return raw transaction hex.' };
  }
  const decoded = decodeTransaction(hexToBin(raw.trim()));
  if (typeof decoded === 'string') return { error: `Could not decode raw transaction: ${decoded}` };
  return {
    txid,
    outputs: decoded.outputs.map((o, index) => ({
      index,
      satoshis: o.valueSatoshis,
      lockingBytecodeHex: binToHex(o.lockingBytecode),
    })),
  };
}

export async function electrumGetTransaction(rpc: ElectrumRpc, txid: string): Promise<ElectrumTx | { error: string }> {
  try {
    const raw = await rpc.request('blockchain.transaction.get', [txid, false]);
    return parseElectrumRawTransaction(txid, raw);
  } catch (err) {
    return { error: `Electrum transaction lookup failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function electrumBroadcast(rpc: ElectrumRpc, rawHex: string): Promise<{ txid: string } | { error: string }> {
  try {
    const result = await rpc.request('blockchain.transaction.broadcast', [rawHex]);
    if (typeof result === 'string' && /^[0-9a-f]{64}$/i.test(result.trim())) {
      return { txid: result.trim().toLowerCase() };
    }
    return { error: 'Electrum broadcast did not return a 64-character transaction id.' };
  } catch (err) {
    return { error: `Electrum broadcast failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
