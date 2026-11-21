import { go } from '../lib/route';
import { NETWORK_CLAIM, UNVERIFIED_PAYMENT } from '../lib/claims';
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
          <p className="eyebrow">Bitcoin Cash · prototype</p>
          <h1>
            <span className="zh-lead">飲茶分帳 + 派利是</span>
            <span className="zh-lead sub">用 BCH 結算</span>
          </h1>
          <p className="lede">
            Split a yum cha bill and pass a lai see. The pages build a Bitcoin Cash request. They do not themselves
            move coins. No account and no backend — a link and a QR code. An invoice is not a confirmed payment.
          </p>
          <p className="network-claim">
            {NETWORK_CLAIM} {UNVERIFIED_PAYMENT}
          </p>
          <div className="btn-row">
            <a className="btn seal" href="#/demo" onClick={go('/demo')}>
              Start the 2-minute Chipnet walkthrough
            </a>
            <a className="btn secondary" href="#/new" onClick={go('/new')}>
              Open a new tab
            </a>
            <a className="btn ghost" href="#/lai" onClick={go('/lai')}>
              Send lai see
            </a>
          </div>
        </div>
        <div className="hero-card">
          <div className="stamp">利是</div>
          <p className="kicker">Chipnet demo receipt</p>
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: '1.6rem', margin: '6px 0 12px' }}>Sunday yum cha</h2>
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
          <p className="fine">Test coins only. Do not send mainnet BCH to this demo.</p>
        </div>
      </section>

      <section className="section walkthrough" aria-labelledby="walkthrough-title">
        <h2 id="walkthrough-title">Two-minute walkthrough</h2>
        <p className="muted">
          Desktop and mobile use the same steps. This path stays on Chipnet and does not broadcast a transaction.
          It is not a live funded payment on Chipnet or mainnet.
        </p>
        <ol className="steps">
          <li>
            <a href="#/demo" onClick={go('/demo')}>
              Open the yum cha demo
            </a>
            . Read the Chipnet receipt, the four shares, and the host address.
          </li>
          <li>Open one share and read its BIP21 invoice. Do not pay that address from a mainnet wallet.</li>
          <li>
            <a href="#/lai" onClick={go('/lai')}>
              Create a lai see
            </a>{' '}
            on Chipnet if you want to see the claim link. Funding it needs test coins from a faucet. This review did
            not broadcast one.
          </li>
          <li>
            WizardConnect pairing is optional. Live Paytaca/Selene signing has not been observed. A pasted transaction
            id stays unverified until an indexer confirms it.
          </li>
        </ol>
        <p className="callout">
          Prototype and unaudited. Do not send large amounts. If a lai see passphrase is lost and the host backup was
          not saved, the coins cannot be recovered.
        </p>
      </section>

      <section className="section">
        <div className="grid-3">
          <article className="card feature">
            <h3>A tab you can pass around</h3>
            <p>
              Add dishes in satoshis, split equally or by amount, and share one link. Each guest sees their share and
              a BIP21 invoice. The link is not a payment receipt.
            </p>
          </article>
          <article className="card feature">
            <h3>Lai see, not just a QR</h3>
            <p>
              Create a claimable red packet and a funding invoice. An optional passphrase keeps the private key out of
              the claim link. Losing that passphrase and the host backup makes the packet unrecoverable.
            </p>
          </article>
          <article className="card feature">
            <h3>Wallet-native, backend-free</h3>
            <p>
              Pay a BIP21 invoice in a BCH wallet, or pair WizardConnect and request a signature. Claims can be signed
              in the browser with libauth. Neither path has a verified mainnet payment in this review.
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
