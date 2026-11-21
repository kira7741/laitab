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
          <h3>Chipnet claim, 21 November 2026</h3>
          <p>
            Funding of 0.01017 BCH to the packet address was confirmed on the Chipnet explorer. LaiTab then found that
            output through Fulcrum at chipnet.imaginary.cash and broadcast a P2PKH sweep on the same server. This is
            Chipnet only. It is not a mainnet payment and not a Paytaca or Selene signature.
          </p>
          <p>
            Packet{' '}
            <a href="https://chipnet.imaginary.cash/address/bchtest:qq3xdng4pj04ly6zqvk6y3gg6elx9xzqn5ld5vvqjh">
              bchtest:qq3xdng4pj04ly6zqvk6y3gg6elx9xzqn5ld5vvqjh
            </a>
            . Funding{' '}
            <a href="https://chipnet.imaginary.cash/tx/1c06b4339f77b326b4a693b7d9246dd16e3192de01324e7e00553ff71288849a">
              1c06b433…88849a
            </a>
            , block #340,431, 09:30 HKT. Claim{' '}
            <a href="https://chipnet.imaginary.cash/tx/2d16c2b71755192fbe1d1a10e977eb309ce3d6e3b7dd429dcaa84abbaad9afb9">
              2d16c2b7…d9afb9
            </a>{' '}
            pays 0.01016771 BCH to{' '}
            <a href="https://chipnet.imaginary.cash/address/bchtest:qznrmykd4uhln8pcg58q8g5k473uut575qacaj9usw">
              bchtest:qznrmykd4uhln8pcg58q8g5k473uut575qacaj9usw
            </a>
            , fee 229 sats, block #340,433, 09:32 HKT. The memo output reads “LaiTab LaiTab Chipnet claim proof”.
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
