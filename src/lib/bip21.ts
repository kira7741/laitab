import { fromSats } from './money';
import type { PaymentIntent } from './types';

/** BIP21 payment URI. Amount is in BCH (not sats). */
export function bip21(intent: PaymentIntent): string {
  const amount = fromSats(intent.sats);
  const params = new URLSearchParams();
  if (intent.sats > 0) params.set('amount', amount);
  if (intent.message) params.set('message', intent.message);
  const q = params.toString();
  return q ? `${intent.address}?${q}` : intent.address;
}

export function paytacaIntentUrl(intent: PaymentIntent): string {
  // Paytaca handles cashaddr BIP21 directly; this is a convenience deeplink style.
  return bip21(intent);
}
