import { go } from '../lib/route';
import { formatBch } from '../lib/money';
import { DEMO_TOTAL_SATS } from '../lib/demo';
import { listPackets, listTabs } from '../lib/storage';

export function Home() {
  const tabs = typeof localStorage === 'undefined' ? [] : listTabs();
  const packets = typeof localStorage === 'undefined' ? [] : listPackets();
  return (
    <div className="wrap">
      <section className="hero">
        <div>
          <p className="eyebrow">Bitcoin Cash · BCH BLAZE 2026</p>
          <h1>
            <span className="zh">利臺</span>
            Open the tab.
            <br />
            Pass the lai see.
          </h1>
          <p className="lede">
            LaiTab is a seated, shareable way to split a bill and send a red packet on Bitcoin Cash. No account, no
            backend — just a link, a QR code, and a real on-chain payment.
          </p>
          <div className="btn-row">
            <a className="btn seal" href="#/new" onClick={go('/new')}>
              Open a new tab
            </a>
            <a className="btn secondary" href="#/lai" onClick={go('/lai')}>
              Send lai see
            </a>
            <a className="btn ghost" href="#/demo" onClick={go('/demo')}>
              Try the yum cha demo
            </a>
          </div>
        </div>
        <div className="hero-card">
          <div className="stamp">利是</div>
          <p className="kicker">Demo receipt</p>
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: '1.6rem', margin: '6px 0 12px' }}>
            Sunday yum cha
          </h2>
          <div className="meta-line">
            <span>Kowloon Bay Tea House</span>
            <span>4 people</span>
          </div>
          <div className="meta-line">
            <span>Network</span>
            <strong>Chipnet</strong>
          </div>
          <div className="meta-line">
            <span>Total, tip included</span>
            <strong>{formatBch(DEMO_TOTAL_SATS)}</strong>
          </div>
          <div className="meta-line">
            <span>Each share</span>
            <strong>{formatBch(DEMO_TOTAL_SATS / 4n)}</strong>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="grid-3">
          <article className="card feature">
            <h3>A tab you can pass around</h3>
            <p>
              Add dishes in satoshis, split equally or by amount, and share one link. Each guest sees only what they
              owe and pays it in Bitcoin Cash.
            </p>
          </article>
          <article className="card feature">
            <h3>Lai see, not just a QR</h3>
            <p>
              Create a claimable red packet. Fund the packet address, then send a blessing link — optionally locked
              with a passphrase you say out loud at the table.
            </p>
          </article>
          <article className="card feature">
            <h3>Wallet-native, backend-free</h3>
            <p>
              Pay with a BIP21 invoice in any BCH wallet, or pair a WizardConnect wallet and request a signature. Claims
              are signed in the browser with libauth.
            </p>
          </article>
        </div>
      </section>

      {(tabs.length > 0 || packets.length > 0) && (
        <section className="section">
          <h2>On this device</h2>
          <p className="muted">Saved in your browser only.</p>
          <div className="grid-2" style={{ marginTop: 16 }}>
            <div className="stack">
              {tabs.map((t) => (
                <a key={t.id} className="card feature" href={`#/tab/${t.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <h3>{t.title}</h3>
                  <p>
                    {t.place || 'No place set'} · {t.network} · {t.guests.length} people
                  </p>
                </a>
              ))}
            </div>
            <div className="stack">
              {packets.map((p) => (
                <a key={p.id} className="card feature" href={`#/packet/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <h3>{p.blessing || 'Lai see'}</h3>
                  <p>
                    From {p.fromName} · {p.network} · {p.locked ? 'passphrase locked' : 'open claim link'}
                  </p>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
