import {
  decodeCashAddress,
  decodeCashAddressFormatWithoutPrefix,
  encodeCashAddress,
} from '@bitauth/libauth/build/lib/address/cash-address.js';
import { cashAddressToLockingBytecode } from '@bitauth/libauth/build/lib/address/locking-bytecode.js';
import type { Network } from './types';

export const PREFIX: Record<Network, 'bitcoincash' | 'bchtest'> = {
  mainnet: 'bitcoincash',
  chipnet: 'bchtest',
};

export function networkFromPrefix(prefix: string): Network | null {
  if (prefix === 'bitcoincash') return 'mainnet';
  if (prefix === 'bchtest') return 'chipnet';
  return null;
}

export type ParsedAddress = {
  address: string;
  network: Network;
  type: string;
  payload: Uint8Array;
};

export function normalizeAddress(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, '');
}

export function parseCashAddress(input: string, expect?: Network): ParsedAddress | { error: string } {
  const raw = normalizeAddress(input);
  if (!raw) return { error: 'Enter a Bitcoin Cash address.' };

  const direct = decodeCashAddress(raw);
  let prefix: 'bitcoincash' | 'bchtest' | 'bchreg';
  let payload: Uint8Array;
  let type: 'p2pkh' | 'p2sh' | 'p2pkhWithTokens' | 'p2shWithTokens';

  if (typeof direct !== 'string') {
    prefix = direct.prefix;
    payload = direct.payload;
    type = direct.type;
  } else {
    const payloadOnly = raw.includes(':') ? raw.split(':')[1] : raw;
    const without = decodeCashAddressFormatWithoutPrefix(payloadOnly, [
      'bitcoincash',
      'bchtest',
      'bchreg',
    ]);
    if (typeof without === 'string') return { error: 'That does not look like a valid CashAddr.' };
    const retried = decodeCashAddress(`${without.prefix}:${payloadOnly}`);
    if (typeof retried === 'string') return { error: 'That does not look like a valid CashAddr.' };
    prefix = retried.prefix;
    payload = retried.payload;
    type = retried.type;
  }

  const network = networkFromPrefix(prefix);
  if (!network) return { error: `Unsupported address network: ${prefix}` };
  if (expect && network !== expect) {
    return {
      error:
        expect === 'chipnet'
          ? 'This tab is on Chipnet. Use a bchtest: address, not a mainnet one.'
          : 'This tab is on mainnet. Use a bitcoincash: address, not a test address.',
    };
  }

  const encoded = encodeCashAddress({
    prefix: prefix === 'bchreg' ? 'bchtest' : prefix,
    type,
    payload,
  });
  return {
    address: encoded.address,
    network,
    type,
    payload,
  };
}

export function addressError(input: string, expect?: Network): string | null {
  const parsed = parseCashAddress(input, expect);
  return 'error' in parsed ? parsed.error : null;
}

export function isAddressOk(input: string, expect?: Network): boolean {
  return !('error' in parseCashAddress(input, expect));
}

export function lockingBytecodeFor(address: string): Uint8Array {
  const result = cashAddressToLockingBytecode(address);
  if (typeof result === 'string') throw new Error(result);
  return result.bytecode;
}

export function explorerTxUrl(network: Network, txid: string): string {
  if (network === 'chipnet') return `https://chipnet.imaginary.cash/tx/${txid}`;
  return `https://blockchair.com/bitcoin-cash/transaction/${txid}`;
}

export function explorerAddrUrl(network: Network, address: string): string {
  if (network === 'chipnet') return `https://chipnet.imaginary.cash/address/${address}`;
  return `https://blockchair.com/bitcoin-cash/address/${address}`;
}

export function faucetUrls(network: Network): { label: string; href: string }[] {
  if (network === 'chipnet') {
    return [
      { label: 'Googol Chipnet faucet', href: 'https://tbch.googol.cash/' },
      { label: 'BCH Ninja Chipnet faucet', href: 'https://chipnet.bch.ninja/' },
    ];
  }
  return [];
}

export function shortenAddress(address: string, head = 10, tail = 8): string {
  const [, payload] = address.includes(':') ? address.split(':') : [null, address];
  const prefix = address.includes(':') ? address.split(':')[0] + ':' : '';
  if (payload.length <= head + tail) return address;
  return `${prefix}${payload.slice(0, head)}…${payload.slice(-tail)}`;
}
