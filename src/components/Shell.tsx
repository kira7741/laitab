import type { ReactNode } from 'react';
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
          LaiTab is an original Bitcoin Cash dapp built for BCH BLAZE 2026. Chipnet is the default network.
          Mainnet payments only go where you type the address.
        </div>
        <div>Solo project · Hung Chun Pan · Hong Kong</div>
      </footer>
    </>
  );
}
