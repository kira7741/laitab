import { bannerIsComplete, contestBanner } from '../lib/contest';

export function ContestBanner() {
  const config = contestBanner();
  const complete = bannerIsComplete(config);
  return (
    <div className="contest-banner" role="region" aria-label="BCH BLAZE 2026 required project links">
      <div className="contest-banner-inner">
        <strong className="contest-banner-kicker">BCH BLAZE 2026</strong>
        <span>
          Presentation:{' '}
          {config.presentationUrl ? (
            <a href={config.presentationUrl} target="_blank" rel="noreferrer">
              {config.presentationUrl}
            </a>
          ) : (
            <span className="missing">not set</span>
          )}
        </span>
        <span>
          Source Code:{' '}
          {config.sourceUrl ? (
            <a href={config.sourceUrl} target="_blank" rel="noreferrer">
              {config.sourceUrl}
            </a>
          ) : (
            <span className="missing">not set</span>
          )}
        </span>
        <span>
          EMBER2026:{' '}
          {config.emberDonationAddress ? (
            <span className="mono">{config.emberDonationAddress}</span>
          ) : (
            <span className="missing">not set</span>
          )}
        </span>
        {!complete ? <span className="missing">A banner link is missing.</span> : null}
      </div>
    </div>
  );
}
