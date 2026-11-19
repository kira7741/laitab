import { SATS_PER_BCH, type LineItem, type Tab } from './types';

export function toSats(bch: string | number): bigint {
  const raw = String(bch).trim();
  if (!raw) return 0n;
  const neg = raw.startsWith('-');
  const [whole, frac = ''] = (neg ? raw.slice(1) : raw).split('.');
  const fracPadded = (frac + '00000000').slice(0, 8);
  const sats = BigInt(whole || '0') * SATS_PER_BCH + BigInt(fracPadded || '0');
  return neg ? -sats : sats;
}

export function fromSats(sats: bigint | number): string {
  const v = typeof sats === 'number' ? BigInt(sats) : sats;
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = abs / SATS_PER_BCH;
  const frac = (abs % SATS_PER_BCH).toString().padStart(8, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole.toString()}${frac ? '.' + frac : ''}`;
}

export function formatBch(sats: bigint | number, opts?: { unit?: boolean }): string {
  const n = fromSats(sats);
  return opts?.unit === false ? n : `${n} BCH`;
}

export function formatSats(sats: bigint | number): string {
  const v = typeof sats === 'number' ? BigInt(sats) : sats;
  return `${v.toLocaleString('en-HK')} sats`;
}

/** Parse a human amount typed as BCH (preferred) or an integer satoshi string. */
export function parseAmountToSats(input: string): bigint | null {
  const t = input.trim().replace(/,/g, '');
  if (!t) return 0n;
  if (!/^\d+(\.\d{1,8})?$/.test(t)) return null;
  return toSats(t);
}

export function subtotalSats(items: LineItem[]): bigint {
  return items.reduce((acc, it) => acc + BigInt(it.unitSats) * BigInt(it.qty), 0n);
}

export function taxSats(items: LineItem[], taxPct: number): bigint {
  return (subtotalSats(items) * BigInt(Math.round(taxPct * 100))) / 10000n;
}

export function tipSats(items: LineItem[], tipPct: number): bigint {
  return (subtotalSats(items) * BigInt(Math.round(tipPct * 100))) / 10000n;
}

export function totalSats(tab: Pick<Tab, 'items' | 'taxPct' | 'tipPct'>): bigint {
  return subtotalSats(tab.items) + taxSats(tab.items, tab.taxPct) + tipSats(tab.items, tab.tipPct);
}

export function paidTotal(tab: Tab): bigint {
  return tab.guests.reduce((acc, g) => acc + BigInt(g.paidSats), 0n);
}

export function remainingSats(tab: Tab): bigint {
  const rem = totalSats(tab) - paidTotal(tab);
  return rem < 0n ? 0n : rem;
}

/** Distribute total across n guests; remainder sats go one-by-one in order. */
export function equalShares(total: bigint, count: number): bigint[] {
  if (count <= 0) return [];
  const n = BigInt(count);
  const base = total / n;
  const rem = Number(total % n);
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1n : 0n));
}

export function applyEqualSplit(tab: Tab): Tab {
  const total = totalSats(tab);
  const shares = equalShares(total, tab.guests.length);
  return {
    ...tab,
    split: 'equal',
    guests: tab.guests.map((g, i) => ({ ...g, shareSats: Number(shares[i] ?? 0n) })),
  };
}

export function assertSharesMatchTotal(tab: Tab): string | null {
  if (tab.guests.length === 0) return 'Add at least one person to split the bill.';
  const shareSum = tab.guests.reduce((acc, g) => acc + BigInt(g.shareSats), 0n);
  const total = totalSats(tab);
  if (shareSum !== total) {
    return `Shares add up to ${fromSats(shareSum)} BCH, but the bill is ${fromSats(total)} BCH.`;
  }
  return null;
}

export function id(prefix = ''): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return prefix + hex;
}
