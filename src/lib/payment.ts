import { binToHex } from '@bitauth/libauth/build/lib/format/hex.js';
import { cashAddressToLockingBytecode } from '@bitauth/libauth';
import { fetchTransaction, isDisplayTxid } from './indexer';
import type { Guest, Network, PaymentAck, Tab } from './types';

export function normalizeTxid(txid: string): string {
  return txid.trim().replace(/[^0-9a-f]/gi, '').toLowerCase();
}

export function parsePaymentTxid(txid: string): { txid: string } | { error: string } {
  const clean = normalizeTxid(txid);
  if (!isDisplayTxid(clean)) {
    return { error: 'A transaction id must be exactly 64 hexadecimal characters.' };
  }
  return { txid: clean };
}

export function hasRecordedTxid(guest: Guest, txid: string): boolean {
  const clean = normalizeTxid(txid);
  if (guest.paidTxids.some((t) => normalizeTxid(t) === clean)) return true;
  return (guest.acknowledgements ?? []).some((a) => a.txid === clean);
}

export type RecordResult = { guest: Guest; ack: PaymentAck } | { error: string };

export function recordAcknowledgement(
  guest: Guest,
  txid: string,
  sats: number,
  status: PaymentAck['status'] = 'unverified',
): RecordResult {
  const parsed = parsePaymentTxid(txid);
  if ('error' in parsed) return parsed;
  if (hasRecordedTxid(guest, parsed.txid)) {
    return { error: 'That transaction id is already recorded on this share.' };
  }
  const ack: PaymentAck = {
    txid: parsed.txid,
    sats,
    status,
    recordedAt: new Date().toISOString(),
  };
  const paidSats = status === 'verified' ? guest.paidSats + sats : guest.paidSats;
  return {
    guest: {
      ...guest,
      paidSats,
      paidTxids: [...guest.paidTxids, parsed.txid],
      acknowledgements: [...(guest.acknowledgements ?? []), ack],
    },
    ack,
  };
}

export function paymentLabel(guest: Guest): 'open' | 'unverified' | 'verified' {
  const acks = guest.acknowledgements ?? [];
  if (acks.some((a) => a.status === 'verified')) return 'verified';
  if (acks.length > 0 || guest.paidTxids.length > 0 || guest.paidSats > 0) return 'unverified';
  return 'open';
}

export function acknowledgedSats(guest: Guest): bigint {
  const acks = guest.acknowledgements ?? [];
  if (acks.length > 0) return acks.reduce((acc, a) => acc + BigInt(a.sats), 0n);
  return BigInt(guest.paidSats);
}

export function verifiedSats(guest: Guest): bigint {
  return (guest.acknowledgements ?? [])
    .filter((a) => a.status === 'verified')
    .reduce((acc, a) => acc + BigInt(a.sats), 0n);
}

/** Sats already attributed to this transaction on the tab, excluding one guest. */
export function allocatedSatsForTxid(tab: Pick<Tab, 'guests'>, txid: string, exceptGuestId?: string): bigint {
  const clean = normalizeTxid(txid);
  let sum = 0n;
  for (const guest of tab.guests) {
    if (exceptGuestId && guest.id === exceptGuestId) continue;
    const acks = (guest.acknowledgements ?? []).filter((a) => a.txid === clean);
    if (acks.length > 0) {
      sum += acks.reduce((acc, a) => acc + BigInt(a.sats), 0n);
      continue;
    }
    // Older snapshots may only have paidTxids. If this is the sole recorded
    // txid, attribute paidSats; otherwise do not guess an amount, but the
    // txid is still treated as in use via hasRecordedTxid on that guest.
    if (guest.paidTxids.some((t) => normalizeTxid(t) === clean) && guest.paidTxids.length === 1) {
      sum += BigInt(guest.paidSats);
    }
  }
  return sum;
}

export async function verifyPaymentOnChain(opts: {
  txid: string;
  network: Network;
  destination: string;
  expectedSats: bigint;
  alreadyAllocatedSats?: bigint;
}): Promise<{ status: 'verified' | 'mismatch' | 'unavailable'; detail: string }> {
  const parsed = parsePaymentTxid(opts.txid);
  if ('error' in parsed) return { status: 'mismatch', detail: parsed.error };
  const looked = await fetchTransaction(parsed.txid, opts.network);
  if ('error' in looked) return { status: 'unavailable', detail: looked.error };

  const dest = cashAddressToLockingBytecode(opts.destination);
  const destHex = typeof dest === 'string' ? null : binToHex(dest.bytecode);
  const destNorm = opts.destination.trim().toLowerCase();

  const matches = looked.outputs.filter((o) => {
    const addrOk = o.address ? o.address.trim().toLowerCase() === destNorm : false;
    const scriptOk = destHex && o.lockingBytecodeHex ? o.lockingBytecodeHex.toLowerCase() === destHex : false;
    return addrOk || scriptOk;
  });
  if (matches.length === 0) {
    return {
      status: 'mismatch',
      detail: 'That transaction was found, but it does not pay the host address on this tab.',
    };
  }
  const paid = matches.reduce((acc, o) => acc + o.satoshis, 0n);
  const allocated = opts.alreadyAllocatedSats ?? 0n;
  const remaining = paid - allocated;
  if (remaining <= 0n) {
    return {
      status: 'mismatch',
      detail: "That transaction's payment to the host is already fully allocated on this tab.",
    };
  }
  if (remaining < opts.expectedSats) {
    return {
      status: 'mismatch',
      detail: `Only ${remaining.toString()} sats from that transaction remain unallocated on this tab, which is less than this share.`,
    };
  }
  return { status: 'verified', detail: `On-chain output to the host is ${paid.toString()} sats.` };
}

export function replaceGuest(tab: Tab, guest: Guest): Tab {
  return { ...tab, guests: tab.guests.map((g) => (g.id === guest.id ? guest : g)) };
}

export type AcknowledgeResult =
  | { tab: Tab; ack: PaymentAck; warning?: string }
  | { error: string };

/**
 * Record a payment against one share, after checking the transaction on-chain
 * when an indexer is reachable. A transaction that does not pay the host, or
 * whose host output is already fully allocated to other shares, is not recorded.
 * If the indexer is down, the id is stored as an unverified acknowledgement.
 */
export async function acknowledgeOnTab(
  tab: Tab,
  guestId: string,
  txid: string,
  sats: number,
): Promise<AcknowledgeResult> {
  const guest = tab.guests.find((g) => g.id === guestId);
  if (!guest) return { error: 'That person is not on this tab.' };
  const parsed = parsePaymentTxid(txid);
  if ('error' in parsed) return parsed;
  if (hasRecordedTxid(guest, parsed.txid)) {
    return { error: 'That transaction id is already recorded on this share.' };
  }
  const allocated = allocatedSatsForTxid(tab, parsed.txid, guest.id);
  const checked = await verifyPaymentOnChain({
    txid: parsed.txid,
    network: tab.network,
    destination: tab.hostAddress,
    expectedSats: BigInt(sats),
    alreadyAllocatedSats: allocated,
  });
  if (checked.status === 'mismatch') return { error: checked.detail };
  const status = checked.status === 'verified' ? 'verified' : 'unverified';
  const recorded = recordAcknowledgement(guest, parsed.txid, sats, status);
  if ('error' in recorded) return recorded;
  return {
    tab: replaceGuest(tab, recorded.guest),
    ack: recorded.ack,
    warning: checked.status === 'unavailable' ? checked.detail : undefined,
  };
}
