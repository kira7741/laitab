import { bannerIsComplete, contestBanner } from '../lib/contest';

const TEMPLATE = 'https://docs.google.com/presentation/d/1Yfuk9CJkf4U9M_WukcELhumWgj3Ak6345Ewy8hSp-Hk/edit?usp=sharing';

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
              Short introduction (Widget Factory)
            </a>
          ) : (
            <span className="missing">
              not published yet — a hosted deck based on the{' '}
              <a href={TEMPLATE} target="_blank" rel="noreferrer">
                official Widget Factory template
              </a>{' '}
              is still required
            </span>
          )}
        </span>
        <span>
          Source:{' '}
          {config.sourceUrl ? (
            <a href={config.sourceUrl} target="_blank" rel="noreferrer">
              Project repository
            </a>
          ) : (
            <span className="missing">not published yet</span>
          )}
        </span>
        <span>
          EMBER2026 donations:{' '}
          {config.emberDonationAddress ? (
            <span className="mono">{config.emberDonationAddress}</span>
          ) : (
            <span className="missing">CashTokens address not provided yet</span>
          )}
        </span>
        {!complete ? (
          <span className="missing">Set VITE_BLAZE_PRESENTATION_URL, VITE_BLAZE_SOURCE_URL, and VITE_BLAZE_EMBER_ADDRESS before a live submission.</span>
        ) : null}
      </div>
    </div>
  );
}
