import { ENTRANT_NAME, NETWORK_CLAIM, UNVERIFIED_PAYMENT } from '../lib/claims';
import { PUBLIC_WALKTHROUGH_URL } from '../lib/contest';
import { DEMO_HOST } from '../lib/demo';

export function About() {
  return (
    <div className="wrap section">
      <p className="eyebrow">Prototype notes</p>
      <h1>About LaiTab</h1>
      <p className="lede">
        LaiTab is {ENTRANT_NAME}&apos;s unaudited prototype for splitting a bill and sending a lai see (red packet) on
        Bitcoin Cash. {NETWORK_CLAIM} {UNVERIFIED_PAYMENT}
      </p>
      <p>
        The source, the hosted walkthrough, and the deck are public. This project has not been formally submitted to
        BCH BLAZE. Submission is pending owner review and an official Telegram confirmation. This page does not send
        that confirmation.
      </p>

      <div className="grid-2">
        <article className="card feature">
          <h3>Two-minute walkthrough</h3>
          <p className="fine">Chipnet only. Same steps on a phone or a desktop. No mainnet payment is part of this path.</p>
          <ol className="steps">
            <li>Open the yum cha demo tab and read the Chipnet label on the receipt.</li>
            <li>Inspect the shares and the BIP21 pay codes. Do not pay the demo address from mainnet.</li>
            <li>
              Create a lai see on Chipnet. Funding and claiming need test coins. A lost passphrase is unrecoverable
              without the host backup.
            </li>
            <li>
              Optionally pair a wallet with WizardConnect and request a signature, or copy the BIP21 invoice. Live
              Paytaca/Selene signing has not been observed.
            </li>
          </ol>
        </article>
        <article className="card feature">
          <h3>What is on-chain, and what is not</h3>
          <p>
            Tab data lives in the URL and in your browser. There is no backend. The app can build a BIP21 invoice, a
            WizardConnect signature request, and a libauth-signed lai see sweep. Those are supported actions. A
            supported action is not a verified payment.
          </p>
          <p>
            Public indexers are best-effort. If none reply, paste unspent outputs and/or broadcast the signed hex
            yourself. A missing lookup is not treated as a confirmed payment. Hosting{' '}
            <a href={PUBLIC_WALKTHROUGH_URL}>{PUBLIC_WALKTHROUGH_URL}</a> does not prove that any payment was sent.
          </p>
        </article>
        <article className="card feature">
          <h3>Chipnet faucets</h3>
          <p>
            Use <a href="https://tbch.googol.cash/" target="_blank" rel="noreferrer">tbch.googol.cash</a> (select
            chipnet) or <a href="https://chipnet.bch.ninja/" target="_blank" rel="noreferrer">chipnet.bch.ninja</a>.
            Explorer:{' '}
            <a href="https://chipnet.imaginary.cash/" target="_blank" rel="noreferrer">
              chipnet.imaginary.cash
            </a>
            .
          </p>
        </article>
        <article className="card feature">
          <h3>Demo host recovery</h3>
          <p>
            The yum cha demo pays a Chipnet address derived from SHA-256(<code>{DEMO_HOST.phrase}</code>). If anyone
            sends test coins there, they can be recovered with the documented WIF in the README. Do not send mainnet
            BCH to the demo address.
          </p>
          <p className="mono fine">{DEMO_HOST.address}</p>
        </article>
      </div>
    </div>
  );
}
