import type { LaiSeePacket, Tab } from './types';

const TAB_KEY = 'laitab:tabs:v1';
const PACKET_KEY = 'laitab:packets:v1';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function listTabs(): Tab[] {
  return read<Tab[]>(TAB_KEY, []);
}

export function saveTab(tab: Tab): void {
  const all = listTabs().filter((t) => t.id !== tab.id);
  all.unshift(tab);
  write(TAB_KEY, all.slice(0, 50));
}

export function getTab(id: string): Tab | undefined {
  return listTabs().find((t) => t.id === id);
}

export function listPackets(): LaiSeePacket[] {
  return read<LaiSeePacket[]>(PACKET_KEY, []);
}

export function savePacket(packet: LaiSeePacket): void {
  const all = listPackets().filter((p) => p.id !== packet.id);
  all.unshift(packet);
  write(PACKET_KEY, all.slice(0, 50));
}

export function getPacket(id: string): LaiSeePacket | undefined {
  return listPackets().find((p) => p.id === id);
}

/**
 * Combine a claim-link payload with any packet already saved in this browser.
 * Prefer locally saved secrets so opening the public link cannot wipe a host
 * backup key. Do not strip a key that arrived in the payload when nothing is
 * stored yet — otherwise "#/packet/<id>" would later show a keyless packet.
 */
export function mergeClaimPacket(incoming: LaiSeePacket, existing?: LaiSeePacket | null): LaiSeePacket {
  const wif = existing?.wif ?? incoming.wif;
  const enc = existing?.enc ?? incoming.enc;
  return {
    ...incoming,
    wif,
    enc,
    locked: Boolean(enc) || Boolean(incoming.locked && !wif),
  };
}
