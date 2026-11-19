# LaiTab · 利臺

Open a tab. Pass the lai see. Settle in Bitcoin Cash.

A solo dapp built for **BCH BLAZE 2026** (Mainnet Track). There is no backend and no account. A tab or a red packet is a shareable link; the coins move on Bitcoin Cash.

## Quick start

```bash
cd laitab
npm install
npm run dev
```

Then open the printed local URL. Useful hash routes:

- `#/` home
- `#/demo` yum cha demo tab (Chipnet)
- `#/new` create a tab
- `#/lai` create a lai see
- `#/about` judging notes and faucet links

Production build:

```bash
npm run build
npm run preview
```

Automated checks (bill math, CashAddr, passphrase encryption, outpoint byte order, OP_RETURN memos, mocked indexers, WizardConnect sign-request shape):

```bash
npm test
```

## Hosted demo

A durable public HTTPS build is at https://gleaming-cheesecake-31e454.netlify.app (published 18 November 2026, 12:53 HKT, no site password). Official banner fields are still empty. Confirm the URL still opens before a judge uses it.

To pack source for a later public GitHub/lab repo (`node_modules`, `dist`, and `.env` are excluded):

```bash
npm run pack
```

The zip lands in `../artifacts/laitab-src-YYYY-MM-DD.zip`. Do not submit from this bot.

## Try the demo without a wallet

Open `#/demo`. It is a four-person yum cha bill at a Kowloon Bay tea house, total **0.0935 BCH** on Chipnet including a 10% tip, **0.023375 BCH** per person. You can inspect the receipt, BIP21 pay codes, and share link immediately.

The demo host address is derived from `SHA-256("laitab-demo-host-v1")`:

```
bchtest:qzqxmu8z2c3tgtut8f5sw6t6fe92p87pccwre396hc
```

**Do not send mainnet BCH there.** If Chipnet coins are sent to it, they can be recovered with the WIF documented below. Reset the demo tab from the banner, or open `#/demo/reset`.

Demo host WIF (Chipnet / testnet only):

```
cNPeucZGUi3sWYNXEGacoz3QqiyrNki32AJ6n6u1J67RymWyAGxp
```

Chipnet faucets: [tbch.googol.cash](https://tbch.googol.cash/) (select chipnet), [chipnet.bch.ninja](https://chipnet.bch.ninja/). Explorer: [chipnet.imaginary.cash](https://chipnet.imaginary.cash/).

## What it does

- **Tabs.** Title, place, line items in BCH, tax and tip, equal or custom split. Shares are integer satoshis and are forced to sum to the bill.
- **Share.** One URL and a QR code. Guests can add themselves.
- **Pay.** BIP21 invoice per share, open-in-wallet button, copy URI, and an optional WizardConnect pairing plus a “Request wallet signature” path that builds a protocol sign request. Live Paytaca/Selene signing has not been observed in this package. A pasted 64-character txid is an unverified acknowledgement until an indexer can confirm it.
- **Lai see.** A fresh P2PKH address, funding invoice, claim link. Optional AES-GCM passphrase so the private key is not in the clear. The browser signs a sweep with [libauth](https://github.com/bitauth/libauth). If an indexer cannot be reached, paste UTXOs (`txid:vout:satoshis`) and/or broadcast the signed hex yourself.
- **Remainder.** From a tab, turn what is still open into a lai see.

Default network is **Chipnet**. Mainnet is explicit and warned.

## Design choices

See [`../APPROACH.md`](../APPROACH.md) for the contest path, rejected alternatives, and the review pass.

WizardConnect is the organizers’ wallet protocol, not WalletConnect v2, and does not need a Reown project id.

Public indexers are best-effort. Official Bitcoin Cash Chronik HTTP is protobuf. The mainnet list uses the documented PayButton Chronik base `https://bch.paybutton.io` (and the older documented `https://chronik.pay2stay.com/bch` as a fallback). eCash `/xec` bases are not used. No documented live Chipnet BCH Chronik HTTP endpoint was found; Chipnet lookup uses documented Imaginary.cash Fulcrum WebSocket servers when a browser can reach them. `chipnet.imaginary.cash` remains a web explorer, not an Esplora `/api` server. If no indexer replies, paste UTXOs and/or pay with BIP21. A failed lookup is never treated as an on-chain success. See [`../INDEXER-RESEARCH.md`](../INDEXER-RESEARCH.md).

The required BCH BLAZE homepage banner is rendered at the top of every page. Do not invent the three official values. Set `VITE_BLAZE_PRESENTATION_URL`, `VITE_BLAZE_SOURCE_URL`, and `VITE_BLAZE_EMBER_ADDRESS` only with a real hosted Widget Factory presentation, a public source repo, and an entrant-controlled CashTokens-compatible EMBER2026 donation address.

## Project layout

```
src/lib/        money, CashAddr, BIP21, storage, indexer, sweep
src/pages/      home, create tab, tab view, lai see, claim, about
src/wallet/     WizardConnect hook and QR dialog
scripts/check.ts
```

## Submission

This repository folder is the project. Host `dist/` (or the dev tree) at a public HTTPS URL, then follow [`../SUBMISSION-CHECKLIST.md`](../SUBMISSION-CHECKLIST.md) and paste [`../WRITEUP.md`](../WRITEUP.md) into DoraHacks. Do not submit from this bot.
