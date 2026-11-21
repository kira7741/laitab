/**
 * BCH BLAZE homepage banner fields.
 * Public URLs and the entrant EMBER2026 address are the defaults.
 * A non-empty Vite env var or setContestBanner() overrides a field.
 */
export type ContestBannerConfig = {
  /** Hosted project deck. */
  presentationUrl: string;
  /** Public source repository. */
  sourceUrl: string;
  /** Entrant-controlled CashTokens-compatible address for EMBER2026 donations. */
  emberDonationAddress: string;
};

export const PUBLIC_BANNER: ContestBannerConfig = {
  presentationUrl: 'https://transcendent-parfait-b2106b.netlify.app',
  sourceUrl: 'https://github.com/kira7741/laitab',
  emberDonationAddress: 'bitcoincash:zzrrg2ljvyvw3az2jhrffuuuwh38399stqk320c4q9',
};

/** Static walkthrough already published. Hosting it is not a payment receipt. */
export const PUBLIC_WALKTHROUGH_URL = 'https://gleaming-cheesecake-31e454.netlify.app';

function readEnv(name: string): string {
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
    const value = env?.[name];
    return typeof value === 'string' ? value.trim() : '';
  } catch {
    return '';
  }
}

function pick(override: string | undefined, envName: string, fallback: string): string {
  if (typeof override === 'string' && override.trim()) return override.trim();
  const fromEnv = readEnv(envName);
  if (fromEnv) return fromEnv;
  return fallback;
}

let override: Partial<ContestBannerConfig> | null = null;

export function setContestBanner(partial: Partial<ContestBannerConfig> | null): void {
  override = partial;
}

export function contestBanner(): ContestBannerConfig {
  return {
    presentationUrl: pick(override?.presentationUrl, 'VITE_BLAZE_PRESENTATION_URL', PUBLIC_BANNER.presentationUrl),
    sourceUrl: pick(override?.sourceUrl, 'VITE_BLAZE_SOURCE_URL', PUBLIC_BANNER.sourceUrl),
    emberDonationAddress: pick(
      override?.emberDonationAddress,
      'VITE_BLAZE_EMBER_ADDRESS',
      PUBLIC_BANNER.emberDonationAddress,
    ),
  };
}

export function bannerIsComplete(config = contestBanner()): boolean {
  return Boolean(config.presentationUrl && config.sourceUrl && config.emberDonationAddress);
}
