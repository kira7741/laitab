import { encodeCashAddress, hash160 } from '@bitauth/libauth';
import {
  PATH_CHANGE,
  PATH_RECEIVE,
  childIndexOfPathName,
  type PathName,
  type SignTransactionResponse,
} from '@wizardconnect/core';
import type { DappConnectionManager } from '@wizardconnect/dapp';
import type { WcSignTransactionRequest } from '@bch-wc2/interfaces';
import { PREFIX } from '../lib/address';
import { attachLockingBytecode, fetchUtxos, type Utxo } from '../lib/indexer';
import { planWalletPayment, sourceOutputsFromPlan, transactionFromPlan } from '../lib/sweep';
import type { Network } from '../lib/types';

export type WalletAccount = {
  receiveAddress: string;
  changeAddress: string;
  receiveIndex: number;
  changeIndex: number;
  network: Network;
  paths: { name: string; childIndex: number }[];
};

export type WalletManagerView = {
  getPubkey(childIndex: number, index: bigint): Uint8Array | undefined;
  hasPath?(childIndex: number): boolean;
  getSessionPaths?(): { name: string; xpub: string }[];
  signTransaction?(
    request: Pick<{ transaction: WcSignTransactionRequest; inputPaths: [number, PathName, number][] }, 'transaction' | 'inputPaths'>,
    options?: { signal?: AbortSignal },
  ): Promise<SignTransactionResponse>;
};

export function cashAddressFromPubkey(publicKey: Uint8Array, network: Network): string {
  const payload = hash160(publicKey);
  return encodeCashAddress({ prefix: PREFIX[network], type: 'p2pkh', payload }).address;
}

export function deriveReceiveAddress(
  manager: WalletManagerView,
  network: Network,
  receiveIndex = 0,
  changeIndex = 0,
): WalletAccount | { error: string } {
  const receiveChild = childIndexOfPathName(PATH_RECEIVE) ?? 0;
  const changeChild = childIndexOfPathName(PATH_CHANGE) ?? 1;
  const receiveKey = manager.getPubkey(receiveChild, BigInt(receiveIndex));
  if (!receiveKey) {
    return {
      error:
        'The connected wallet has not shared an account key yet, so LaiTab cannot derive an address or request a signature. Use the BIP21 invoice instead.',
    };
  }
  const changeKey = manager.getPubkey(changeChild, BigInt(changeIndex)) ?? receiveKey;
  const paths = (manager.getSessionPaths?.() ?? []).map((p) => ({
    name: p.name,
    childIndex: childIndexOfPathName(p.name) ?? receiveChild,
  }));
  return {
    receiveAddress: cashAddressFromPubkey(receiveKey, network),
    changeAddress: cashAddressFromPubkey(changeKey, network),
    receiveIndex,
    changeIndex,
    network,
    paths,
  };
}

export async function collectWalletUtxos(
  manager: WalletManagerView,
  network: Network,
  lookup: typeof fetchUtxos = fetchUtxos,
  opts?: { receiveLimit?: number; changeLimit?: number },
): Promise<{ utxos: Utxo[]; addresses: string[]; error?: string; statusSource?: string }> {
  const receiveLimit = opts?.receiveLimit ?? 10;
  const changeLimit = opts?.changeLimit ?? 5;
  const receiveChild = childIndexOfPathName(PATH_RECEIVE) ?? 0;
  const changeChild = childIndexOfPathName(PATH_CHANGE) ?? 1;
  const addresses: { address: string; name: PathName; index: number }[] = [];

  const pushPath = (name: PathName, child: number, limit: number) => {
    for (let i = 0; i < limit; i += 1) {
      const key = manager.getPubkey(child, BigInt(i));
      if (!key) break;
      addresses.push({ address: cashAddressFromPubkey(key, network), name, index: i });
    }
  };
  pushPath(PATH_RECEIVE, receiveChild, receiveLimit);
  pushPath(PATH_CHANGE, changeChild, changeLimit);
  if (addresses.length === 0) {
    return {
      utxos: [],
      addresses: [],
      error:
        'The connected wallet did not share deriveable keys. Pairing succeeded, but LaiTab cannot build a payment from this session. Use the BIP21 invoice.',
    };
  }

  const utxos: Utxo[] = [];
  let lastSource: string | undefined;
  let lastError: string | undefined;
  for (const entry of addresses) {
    const { utxos: found, status } = await lookup(entry.address, network);
    if (status.ok) lastSource = status.source;
    else lastError = status.error;
    for (const u of attachLockingBytecode(found, entry.address)) {
      utxos.push({ ...u, path: { name: entry.name, index: entry.index } });
    }
  }
  if (utxos.length === 0 && lastError && !lastSource) {
    return { utxos: [], addresses: addresses.map((a) => a.address), error: lastError };
  }
  return { utxos, addresses: addresses.map((a) => a.address), statusSource: lastSource };
}

export type WalletPaymentRequest = {
  transaction: WcSignTransactionRequest;
  inputPaths: [number, PathName, number][];
  planFee: bigint;
  planAmount: bigint;
  change: bigint;
};

export function buildWalletSignRequest(opts: {
  utxos: Utxo[];
  destination: string;
  changeAddress: string;
  sendSats: bigint;
  memo?: string;
  userPrompt: string;
}): WalletPaymentRequest | { error: string } {
  try {
    const missingLock = opts.utxos.filter((u) => !u.lockingBytecode);
    if (missingLock.length) {
      return { error: 'Wallet coins are missing locking scripts, so a sign request cannot be built.' };
    }
    const missingPath = opts.utxos.filter((u) => !u.path);
    if (missingPath.length) {
      return { error: 'Wallet coins are missing derivation paths, so a sign request cannot be built.' };
    }
    const plan = planWalletPayment(opts);
    const transaction: WcSignTransactionRequest = {
      transaction: transactionFromPlan(plan),
      sourceOutputs: sourceOutputsFromPlan(plan),
      broadcast: false,
      userPrompt: opts.userPrompt,
    };
    const inputPaths: [number, PathName, number][] = plan.inputs.map((u, index) => [
      index,
      (u.path?.name ?? PATH_RECEIVE) as PathName,
      u.path?.index ?? 0,
    ]);
    return { transaction, inputPaths, planFee: plan.fee, planAmount: plan.send, change: plan.change };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function requestWalletSignature(
  manager: WalletManagerView,
  request: WalletPaymentRequest,
  options?: { signal?: AbortSignal },
): Promise<{ hex: string } | { error: string; cancelled?: boolean }> {
  if (!manager.signTransaction) {
    return {
      error:
        'The connected session has no signTransaction method. Pairing is active, but LaiTab cannot request a signature. Use the BIP21 invoice.',
    };
  }
  try {
    const response = await manager.signTransaction(
      { transaction: request.transaction, inputPaths: request.inputPaths },
      options,
    );
    if (response.error) {
      const cancelled = /cancel/i.test(response.error);
      return { error: response.error, cancelled };
    }
    const hex = response.signedTransaction?.trim() ?? '';
    if (!hex) return { error: 'The wallet returned an empty signature.' };
    return { hex: hex.startsWith('0x') ? hex.slice(2) : hex };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message, cancelled: /cancel|reject|denied/i.test(message) };
  }
}

/** Narrow a live DappConnectionManager to the methods the adapter needs. */
export function asWalletManager(manager: DappConnectionManager): WalletManagerView {
  return {
    getPubkey: (child, index) => manager.getPubkey(child, index),
    hasPath: (child) => manager.hasPath(child),
    getSessionPaths: () => manager.getSessionPaths(),
    signTransaction: (request, options) => manager.signTransaction(request, options),
  };
}
