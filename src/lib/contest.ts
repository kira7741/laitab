/**
 * Official BCH BLAZE Mainnet Track homepage banner fields.
 * Do not invent a source repo, Widget Factory deck URL, or donation address.
 * Supply real values at build time via Vite env, or at runtime with setContestBanner.
 */
export type ContestBannerConfig = {
  /** Hosted short presentation based on the official Widget Factory template. */
  presentationUrl: string;
  /** Public GitHub / lab repository with this project's source. */
  sourceUrl: string;
  /** Entrant-controlled CashTokens-compatible address for EMBER2026 donations. */
  emberDonationAddress: string;
};

const empty: ContestBannerConfig = {
  presentationUrl: '',
  sourceUrl: '',
  emberDonationAddress: '',
};

function readEnv(name: string): string {
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
    const value = env?.[name];
    return typeof value === 'string' ? value.trim() : '';
  } catch {
    return '';
  }
}

let override: Partial<ContestBannerConfig> | null = null;

export function setContestBanner(partial: Partial<ContestBannerConfig> | null): void {
  override = partial;
}

export function contestBanner(): ContestBannerConfig {
  return {
    presentationUrl: override?.presentationUrl ?? readEnv('VITE_BLAZE_PRESENTATION_URL') ?? empty.presentationUrl,
    sourceUrl: override?.sourceUrl ?? readEnv('VITE_BLAZE_SOURCE_URL') ?? empty.sourceUrl,
    emberDonationAddress: override?.emberDonationAddress ?? readEnv('VITE_BLAZE_EMBER_ADDRESS') ?? empty.emberDonationAddress,
  };
}

export function bannerIsComplete(config = contestBanner()): boolean {
  return Boolean(config.presentationUrl && config.sourceUrl && config.emberDonationAddress);
}
