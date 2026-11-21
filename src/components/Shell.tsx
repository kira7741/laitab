import type { ReactNode } from 'react';
import { ENTRANT_NAME, NETWORK_CLAIM } from '../lib/claims';
import { go, pathFromHash } from '../lib/route';
import { WalletBar } from '../wallet/Wizard';
import { ContestBanner } from './ContestBanner';

export function Shell({ children }: { children: ReactNode }) {
  const path = pathFromHash();
  const link = (href: string, label: string) => (
    <a href={`#${href}`} className={path === href || path.startsWith(href + '/') ? 'active' : ''} onClick={go(href)}>
      {label}
    </a>
  );
  return (
    <>
      <ContestBanner />
      <header className="site-header">
        <a className="brand" href="#/" onClick={go('/')}>
          <span className="brand-seal" aria-hidden>利</span>
          <span className="brand-name">
            LaiTab
            <small>Open a tab · Settle in BCH</small>
          </span>
        </a>
        <nav className="nav">
          {link('/new', 'New tab')}
          {link('/lai', 'Lai see')}
          {link('/demo', 'Demo')}
          {link('/about', 'About')}
          <WalletBar />
        </nav>
      </header>
      <main>{children}</main>
      <footer className="site-footer">
        <div>
          LaiTab is an unaudited prototype. {NETWORK_CLAIM} Do not send large amounts.
        </div>
        <div>Solo project · {ENTRANT_NAME} · Hong Kong</div>
      </footer>
    </>
  );
}
