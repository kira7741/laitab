import { DEMO_HOST } from '../lib/demo';

export function About() {
  return (
    <div className="wrap section">
      <p className="eyebrow">How to judge this</p>
      <h1>About LaiTab</h1>
      <p className="lede">
        LaiTab is a solo entry for the BCH BLAZE 2026 Mainnet Track. It is a consumer dapp for splitting a bill and
        sending a lai see (red packet) on Bitcoin Cash, with WizardConnect integration and real on-chain transfers.
      </p>

      <div className="grid-2">
        <article className="card feature">
          <h3>Two-minute demo</h3>
          <ol>
            <li>Open the yum cha demo tab (Chipnet).</li>
            <li>Inspect the receipt, shares, and BIP21 pay codes.</li>
            <li>Create a lai see, fund it from a Chipnet faucet, and claim it to another address.</li>
            <li>Optionally pair a wallet with WizardConnect, then request a signature on a share, or pay the BIP21 invoice.</li>
          </ol>
        </article>
        <article className="card feature">
          <h3>What is actually on-chain</h3>
          <p>
            Tab data lives in the URL and in your browser. The on-chain part is the payment itself: a BIP21 invoice
            or, if a paired wallet can sign, a WizardConnect signature request to the host address, and a libauth-signed sweep when someone claims
            a lai see. Payment memos can be attached as OP_RETURN when the dapp builds the transaction. Public indexers
            are best-effort; if none reply, paste unspent outputs and/or broadcast the signed hex yourself. A missing
            lookup is not treated as a confirmed payment.
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
