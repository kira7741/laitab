import {
  assertSuccess,
  binToHex,
  cashAddressToLockingBytecode,
  createCompilerBCH,
  encodeTransaction,
  generateTransaction,
  hash256,
  importWalletTemplate,
  walletTemplateP2pkhNonHd,
  walletTemplateToCompilerConfiguration,
  type Input,
  type Output,
  type TransactionCommon,
} from '@bitauth/libauth';
import { DUST_SATS, FEE_PER_BYTE } from './types';
import { findDuplicateOutpoints, type Utxo } from './indexer';
import { MAX_MEMO_BYTES, memoToScript, utf8Truncate } from './memo';

let compilerCache: ReturnType<typeof createCompilerBCH> | null = null;

function compiler() {
  if (!compilerCache) {
    const template = assertSuccess(importWalletTemplate(walletTemplateP2pkhNonHd));
    compilerCache = createCompilerBCH(walletTemplateToCompilerConfiguration(template));
  }
  return compilerCache;
}

function lockingBytecode(address: string): Uint8Array {
  const dest = cashAddressToLockingBytecode(address);
  if (typeof dest === 'string') throw new Error(dest);
  return dest.bytecode;
}

export type PlannedOutput = {
  lockingBytecode: Uint8Array;
  valueSatoshis: bigint;
};

export type TransactionPlan = {
  inputs: Utxo[];
  outputs: PlannedOutput[];
  send: bigint;
  fee: bigint;
  change: bigint;
  memo: string | null;
};

export type SweepResult = {
  hex: string;
  txid: string;
  fee: bigint;
  amount: bigint;
  bytes: number;
  change: bigint;
};

export function selectUtxosForAmount(utxos: Utxo[], needed: bigint): Utxo[] | { error: string } {
  const spendable = utxos.filter((u) => !u.hasToken);
  if (spendable.length !== utxos.length) {
    return { error: 'One or more inputs carry tokens and will not be spent, to avoid burning CashTokens.' };
  }
  const dup = findDuplicateOutpoints(spendable);
  if (dup) return { error: `Duplicate unspent output: ${dup}.` };
  const sorted = [...spendable].sort((a, b) => (a.satoshis < b.satoshis ? 1 : a.satoshis > b.satoshis ? -1 : 0));
  const chosen: Utxo[] = [];
  let total = 0n;
  for (const u of sorted) {
    chosen.push(u);
    total += u.satoshis;
    if (total >= needed) return chosen;
  }
  return { error: 'Not enough coins to cover the amount plus fee.' };
}

/**
 * Plan a P2PKH payment. Full sweeps omit sendSats. Payments that leave change
 * require changeAddress. Sub-dust remainder is donated to the fee and included
 * in the returned fee (it is not silently dropped from the accounting).
 */
export function planP2pkhSend(opts: {
  utxos: Utxo[];
  destination: string;
  sendSats?: bigint;
  changeAddress?: string;
  memo?: string;
  fee: bigint;
}): TransactionPlan {
  if (opts.utxos.length === 0) throw new Error('This address has no unspent coins to claim yet.');
  for (const u of opts.utxos) {
    if (u.hasToken) throw new Error('An input carries a token and will not be spent, to avoid burning CashTokens.');
    if (u.satoshis <= 0n) throw new Error('An input has a non-positive value.');
  }
  const dup = findDuplicateOutpoints(opts.utxos);
  if (dup) throw new Error(`Duplicate unspent output: ${dup}.`);

  const destLock = lockingBytecode(opts.destination);
  const totalIn = opts.utxos.reduce((acc, u) => acc + u.satoshis, 0n);
  if (opts.fee < 0n) throw new Error('Fee cannot be negative.');

  const memo = opts.memo ? utf8Truncate(opts.memo, MAX_MEMO_BYTES) : null;
  const memoScript = memo ? memoToScript(memo) : null;

  const send = opts.sendSats ?? totalIn - opts.fee;
  if (send < DUST_SATS) throw new Error('Amount is below the dust limit after fees.');
  const leftover = totalIn - send - opts.fee;
  if (leftover < 0n) throw new Error('Not enough coins in the packet to cover the amount plus fee.');

  const outputs: PlannedOutput[] = [{ lockingBytecode: destLock, valueSatoshis: send }];
  let change = 0n;
  let fee = opts.fee;
  if (leftover >= DUST_SATS) {
    if (!opts.changeAddress) {
      throw new Error('This payment would leave change, and no change address was provided. Sweep the coins in full, or supply a change address.');
    }
    change = leftover;
    outputs.push({ lockingBytecode: lockingBytecode(opts.changeAddress), valueSatoshis: change });
  } else if (leftover > 0n) {
    // Sub-dust remainder cannot be a change output; it is part of the actual fee.
    fee += leftover;
  }
  if (memoScript) {
    outputs.push({ lockingBytecode: memoScript, valueSatoshis: 0n });
  }

  const outputSum = outputs.reduce((acc, o) => acc + o.valueSatoshis, 0n);
  if (totalIn - outputSum !== fee) {
    throw new Error('Fee accounting does not match input and output totals.');
  }
  return { inputs: opts.utxos, outputs, send, fee, change, memo };
}

export function estimateP2pkhBytes(inputCount: number, outputCount: number, memoBytes: number): bigint {
  // 148-byte signed P2PKH inputs, 34-byte P2PKH outputs, 10-byte overhead, memo script + value + varint.
  const memoOverhead = memoBytes > 0 ? BigInt(memoBytes + 12) : 0n;
  return 148n * BigInt(inputCount) + 34n * BigInt(outputCount) + 10n + memoOverhead;
}

function resolveFee(bytes: number, minimum = 200n): bigint {
  const fee = BigInt(bytes) * FEE_PER_BYTE;
  return fee < minimum ? minimum : fee;
}

function planWithSizedFee(opts: {
  utxos: Utxo[];
  destination: string;
  sendSats?: bigint;
  changeAddress?: string;
  memo?: string;
}): TransactionPlan {
  const memoBytes = opts.memo ? utf8Truncate(opts.memo, MAX_MEMO_BYTES).length : 0;
  // Assume a destination output, plus change if this is not a sweep, plus memo.
  const hasChangeGuess = opts.sendSats !== undefined && opts.changeAddress !== undefined;
  const outputGuess = 1 + (hasChangeGuess ? 1 : 0);
  let fee = resolveFee(Number(estimateP2pkhBytes(opts.utxos.length, outputGuess, memoBytes)));
  let plan = planP2pkhSend({ ...opts, fee });
  fee = resolveFee(
    Number(estimateP2pkhBytes(plan.inputs.length, plan.outputs.filter((o) => o.valueSatoshis > 0n).length, memoBytes)),
  );
  plan = planP2pkhSend({ ...opts, fee });
  return plan;
}

export function transactionFromPlan(plan: TransactionPlan, unlocking: 'empty' | Uint8Array[] = 'empty'): TransactionCommon<Input, Output> {
  return {
    version: 2,
    locktime: 0,
    inputs: plan.inputs.map((u, i) => ({
      outpointIndex: u.vout,
      outpointTransactionHash: u.outpointHash,
      sequenceNumber: 0xffffffff,
      unlockingBytecode: unlocking === 'empty' ? new Uint8Array() : (unlocking[i] ?? new Uint8Array()),
    })),
    outputs: plan.outputs.map((o) => ({
      lockingBytecode: o.lockingBytecode,
      valueSatoshis: o.valueSatoshis,
    })),
  };
}

export function sourceOutputsFromPlan(plan: TransactionPlan): Array<Input & Output> {
  return plan.inputs.map((u) => {
    if (!u.lockingBytecode) {
      throw new Error('Each input needs a locking script before a wallet can sign it.');
    }
    return {
      outpointIndex: u.vout,
      outpointTransactionHash: u.outpointHash,
      sequenceNumber: 0xffffffff,
      unlockingBytecode: new Uint8Array(),
      lockingBytecode: u.lockingBytecode,
      valueSatoshis: u.satoshis,
    };
  });
}

/**
 * Build and sign a P2PKH sweep (or payment) from local private keys.
 * Used by Lai See claims and by the funded-demo wallet path.
 */
export function buildP2pkhSend(opts: {
  utxos: Utxo[];
  privateKey: Uint8Array;
  destination: string;
  /** If omitted, sweep all value minus fee. */
  sendSats?: bigint;
  changeAddress?: string;
  memo?: string;
}): SweepResult {
  const plan = planWithSizedFee(opts);

  const result = generateTransaction({
    locktime: 0,
    version: 2,
    inputs: plan.inputs.map((u) => ({
      outpointIndex: u.vout,
      outpointTransactionHash: u.outpointHash,
      sequenceNumber: 0xffffffff,
      unlockingBytecode: {
        compiler: compiler(),
        script: 'unlock',
        valueSatoshis: u.satoshis,
        data: { keys: { privateKeys: { key: opts.privateKey } } },
      },
    })),
    outputs: plan.outputs.map((o) => ({
      lockingBytecode: o.lockingBytecode,
      valueSatoshis: o.valueSatoshis,
    })),
  });
  if (!result.success) {
    throw new Error('Could not sign the claim transaction.');
  }
  const encoded = encodeTransaction(result.transaction);
  const actualFee = plan.inputs.reduce((acc, u) => acc + u.satoshis, 0n) - result.transaction.outputs.reduce((acc, o) => acc + o.valueSatoshis, 0n);
  // Rebuild once with the fee implied by the signed size so 1 sat/byte holds,
  // then always report the actual input-output gap (includes any sub-dust).
  const sizedFee = resolveFee(encoded.length);
  if (sizedFee !== plan.fee && opts.sendSats === undefined) {
    const resized = planP2pkhSend({ ...opts, fee: sizedFee });
    const again = generateTransaction({
      locktime: 0,
      version: 2,
      inputs: resized.inputs.map((u) => ({
        outpointIndex: u.vout,
        outpointTransactionHash: u.outpointHash,
        sequenceNumber: 0xffffffff,
        unlockingBytecode: {
          compiler: compiler(),
          script: 'unlock',
          valueSatoshis: u.satoshis,
          data: { keys: { privateKeys: { key: opts.privateKey } } },
        },
      })),
      outputs: resized.outputs.map((o) => ({
        lockingBytecode: o.lockingBytecode,
        valueSatoshis: o.valueSatoshis,
      })),
    });
    if (!again.success) throw new Error('Could not sign the claim transaction.');
    const encoded2 = encodeTransaction(again.transaction);
    const fee2 =
      resized.inputs.reduce((acc, u) => acc + u.satoshis, 0n) -
      again.transaction.outputs.reduce((acc, o) => acc + o.valueSatoshis, 0n);
    return {
      hex: binToHex(encoded2),
      txid: explorerTxid(encoded2),
      fee: fee2,
      amount: resized.send,
      bytes: encoded2.length,
      change: resized.change,
    };
  }

  return {
    hex: binToHex(encoded),
    txid: explorerTxid(encoded),
    fee: actualFee,
    amount: plan.send,
    bytes: encoded.length,
    change: plan.change,
  };
}

export function explorerTxid(encoded: Uint8Array): string {
  // txid is double-SHA256 of the raw transaction, displayed in reverse byte order.
  const hash = hash256(encoded);
  const reversed = hash.slice().reverse();
  return binToHex(reversed);
}

export function planWalletPayment(opts: {
  utxos: Utxo[];
  destination: string;
  changeAddress: string;
  sendSats: bigint;
  memo?: string;
}): TransactionPlan {
  const dustBuffer = 2000n;
  const chosen = selectUtxosForAmount(opts.utxos, opts.sendSats + dustBuffer);
  if ('error' in chosen) throw new Error(chosen.error);
  return planWithSizedFee({
    utxos: chosen,
    destination: opts.destination,
    sendSats: opts.sendSats,
    changeAddress: opts.changeAddress,
    memo: opts.memo,
  });
}
