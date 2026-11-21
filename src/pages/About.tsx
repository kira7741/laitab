import { ENTRANT_NAME, NETWORK_CLAIM, PROTOTYPE_WARNING } from '../lib/claims';
import { DEMO_HOST } from '../lib/demo';

export function About() {
  return (
    <div className="wrap section">
      <p className="eyebrow">Prototype notes</p>
      <h1>About LaiTab</h1>
      <p className="lede">
        LaiTab is {ENTRANT_NAME}&apos;s prototype for splitting a bill and sending a lai see on Bitcoin Cash.{' '}
        {NETWORK_CLAIM}
      </p>
      <p>{PROTOTYPE_WARNING}</p>

      <div className="grid-2">
        <article className="card feature">
          <h3>Two-minute walkthrough</h3>
          <p className="fine">Same steps on a phone or a desktop. The demo stays on Chipnet.</p>
          <ol className="steps">
            <li>Open the yum cha demo and read the Chipnet label on the receipt.</li>
            <li>Inspect one share and its BIP21 code. Do not pay the demo address from mainnet.</li>
            <li>Create a lai see on Chipnet. The claim link carries the key, encrypted if you set a passphrase.</li>
            <li>Pair WizardConnect only if you want a signature request. BIP21 does not need pairing.</li>
          </ol>
        </article>
        <article className="card feature">
          <h3>What a lai see is</h3>
          <p>
            The browser generates a standard P2PKH key. Funding is an ordinary payment to that address. The claim link
            holds the WIF, or a PBKDF2 and AES-GCM encryption of the WIF. The recipient&apos;s browser unlocks the key
            and signs a P2PKH sweep with libauth.
          </p>
          <p>
            That is a gift key in the link, not an on-chain hashlock. There is no CashScript contract and no timeout
            refund. Coins stay at the packet address until a holder of the key spends them.
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
            The yum cha demo pays a Chipnet address derived from SHA-256(<code>{DEMO_HOST.phrase}</code>). Test coins
            sent there can be recovered with the WIF in the README. Do not send mainnet BCH to that address.
          </p>
          <p className="mono fine">{DEMO_HOST.address}</p>
        </article>
      </div>
    </div>
  );
}
