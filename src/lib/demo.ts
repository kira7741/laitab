/** Recoverable Chipnet demo host, derived from SHA-256("laitab-demo-host-v1"). */
export const DEMO_HOST = {
  phrase: 'laitab-demo-host-v1',
  address: 'bchtest:qzqxmu8z2c3tgtut8f5sw6t6fe92p87pccwre396hc',
  wif: 'cNPeucZGUi3sWYNXEGacoz3QqiyrNki32AJ6n6u1J67RymWyAGxp',
  network: 'chipnet' as const,
};

import type { Tab } from './types';

/** A yum-cha tab in Kowloon Bay, used as the judge-clickable demo. Chipnet only. */
export function demoTab(): Tab {
  return {
    v: 1,
    kind: 'tab',
    id: 'demo-yumcha',
    createdAt: '2026-11-17T12:00:00+08:00',
    network: 'chipnet',
    title: 'Sunday yum cha',
    place: 'Kowloon Bay Tea House',
    hostName: 'Jack Hung',
    hostAddress: DEMO_HOST.address,
    memo: 'LaiTab yum cha',
    taxPct: 0,
    tipPct: 10,
    split: 'equal',
    items: [
      { id: 'i1', name: 'Har gow (shrimp dumplings)', qty: 2, unitSats: 1_200_000 },
      { id: 'i2', name: 'Siu mai', qty: 2, unitSats: 1_000_000 },
      { id: 'i3', name: 'Char siu bao', qty: 1, unitSats: 1_500_000 },
      { id: 'i4', name: 'Cheung fun', qty: 1, unitSats: 1_800_000 },
      { id: 'i5', name: 'Jasmine tea (table)', qty: 1, unitSats: 800_000 },
    ],
    guests: [
      { id: 'g1', name: 'Jack Hung', note: '', shareSats: 0, paidSats: 0, paidTxids: [] },
      { id: 'g2', name: 'Mina', note: '', shareSats: 0, paidSats: 0, paidTxids: [] },
      { id: 'g3', name: 'Ho', note: '', shareSats: 0, paidSats: 0, paidTxids: [] },
      { id: 'g4', name: 'Yan', note: '', shareSats: 0, paidSats: 0, paidTxids: [] },
    ],
  };
}

/**
 * Subtotal = 2*0.012 + 2*0.01 + 0.015 + 0.018 + 0.008 = 0.085 BCH
 * Tip 10% = 0.0085 BCH
 * Total = 0.0935 BCH = 9,350,000 sats
 * Equal share = 2,337,500 sats each
 */
export const DEMO_SUBTOTAL_SATS = 8_500_000n;
export const DEMO_TOTAL_SATS = 9_350_000n;
