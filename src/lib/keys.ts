import {
  encodeCashAddress,
  encodePrivateKeyWif,
  decodePrivateKeyWif,
  generatePrivateKey,
  hash160,
  instantiateSecp256k1,
  type Secp256k1,
} from '@bitauth/libauth';
import type { Network } from './types';
import { PREFIX } from './address';

let secpPromise: Promise<Secp256k1> | null = null;

export function getSecp(): Promise<Secp256k1> {
  if (!secpPromise) secpPromise = instantiateSecp256k1();
  return secpPromise;
}

export type KeyPair = {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  address: string;
  wif: string;
  network: Network;
};

export async function generateP2pkh(network: Network): Promise<KeyPair> {
  const secp = await getSecp();
  const privateKey = generatePrivateKey();
  const publicKey = secp.derivePublicKeyCompressed(privateKey);
  if (typeof publicKey === 'string') throw new Error(publicKey);
  const payload = hash160(publicKey);
  const { address } = encodeCashAddress({ prefix: PREFIX[network], type: 'p2pkh', payload });
  const wif = encodePrivateKeyWif(privateKey, network === 'mainnet' ? 'mainnet' : 'testnet');
  return { privateKey, publicKey, address, wif, network };
}

export async function keyFromWif(wif: string, expect?: Network): Promise<KeyPair> {
  const decoded = decodePrivateKeyWif(wif.trim());
  if (typeof decoded === 'string') throw new Error(decoded);
  const network: Network = decoded.type.startsWith('mainnet') ? 'mainnet' : 'chipnet';
  if (expect && network !== expect) {
    throw new Error(
      expect === 'chipnet'
        ? 'This packet is on Chipnet, but the key is a mainnet key.'
        : 'This packet is on mainnet, but the key is a testnet key.',
    );
  }
  const secp = await getSecp();
  const publicKey = secp.derivePublicKeyCompressed(decoded.privateKey);
  if (typeof publicKey === 'string') throw new Error(publicKey);
  const payload = hash160(publicKey);
  const { address } = encodeCashAddress({ prefix: PREFIX[network], type: 'p2pkh', payload });
  return { privateKey: decoded.privateKey, publicKey, address, wif: wif.trim(), network };
}
