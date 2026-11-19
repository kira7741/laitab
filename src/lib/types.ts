export type Network = 'chipnet' | 'mainnet';

export type SplitMode = 'equal' | 'custom';

export interface LineItem {
  id: string;
  name: string;
  qty: number;
  unitSats: number;
}

export type PaymentAckStatus = 'unverified' | 'verified';

export interface PaymentAck {
  txid: string;
  sats: number;
  status: PaymentAckStatus;
  recordedAt: string;
}

export interface Guest {
  id: string;
  name: string;
  note: string;
  shareSats: number;
  paidSats: number;
  paidTxids: string[];
  /** Optional; older shared links only have paidTxids. Manual records start unverified. */
  acknowledgements?: PaymentAck[];
}

export interface Tab {
  v: 1;
  kind: 'tab';
  id: string;
  createdAt: string;
  network: Network;
  title: string;
  place: string;
  hostName: string;
  hostAddress: string;
  items: LineItem[];
  taxPct: number;
  tipPct: number;
  split: SplitMode;
  guests: Guest[];
  memo: string;
}

export interface EncryptedSecret {
  salt: string;
  iv: string;
  ct: string;
}

export interface LaiSeePacket {
  v: 1;
  kind: 'laisee';
  id: string;
  createdAt: string;
  network: Network;
  fromName: string;
  blessing: string;
  expectedSats: number;
  address: string;
  /** Present when the host chose not to use a passphrase. */
  wif?: string;
  /** Present when the claim link is passphrase-protected. */
  enc?: EncryptedSecret;
  /** True when a passphrase is required (enc is present). */
  locked: boolean;
  /** Optional tab this packet was created from. */
  fromTabId?: string;
}

export interface PaymentIntent {
  network: Network;
  address: string;
  sats: bigint;
  message: string;
}

export const SATS_PER_BCH = 100_000_000n;
export const DUST_SATS = 546n;
export const FEE_PER_BYTE = 1n;
