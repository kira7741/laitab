import { useEffect, useMemo, useState } from 'react';
import { explorerTxUrl, faucetUrls, shortenAddress } from '../lib/address';
import { bip21 } from '../lib/bip21';
import { encodeJson } from '../lib/codec';
import { broadcastTx } from '../lib/indexer';
import { applyEqualSplit, assertSharesMatchTotal, formatBch, formatSats, fromSats, id, paidTotal, parseAmountToSats, remainingSats, subtotalSats, taxSats, tipSats, totalSats } from '../lib/money';
import { acknowledgeOnTab, paymentLabel } from '../lib/payment';
import { QrCode } from '../lib/qr';
import { navigate } from '../lib/route';
import { getTab, saveTab } from '../lib/storage';
import { explorerTxid } from '../lib/sweep';
import type { Guest, Tab } from '../lib/types';
import { CopyButton } from '../components/CopyButton';
import { DEMO_HOST } from '../lib/demo';
import { asWalletManager, buildWalletSignRequest, collectWalletUtxos, deriveReceiveAddress, requestWalletSignature } from '../wallet/adapter';
import { useWallet } from '../wallet/Wizard';
import { hexToBin } from '@bitauth/libauth/build/lib/format/hex.js';

export function TabView({ tabId, shared }: { tabId?: string; shared?: Tab }) {
  const [tab, setTab] = useState<Tab | null>(shared ?? null);
  const [missing, setMissing] = useState(false);
  const [shareErr, setShareErr] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (shared) {
      setTab(shared);
      saveTab(shared);
      return;
    }
    if (!tabId) return;
    const found = getTab(tabId);
    if (found) setTab(found);
    else setMissing(true);
  }, [tabId, shared]);

  if (missing) {
    return (
      <div className="wrap section">
        <h1>Tab not found</h1>
        <p className="muted">This browser does not have that tab saved. Ask the host to share the full link again.</p>
      </div>
    );
  }
  if (!tab) return <div className="wrap section">Loading…</div>;
  return <LoadedTab tab={tab} setTab={setTab} newName={newName} setNewName={setNewName} shareErr={shareErr} setShareErr={setShareErr} />;
}

function LoadedTab({
  tab,
  setTab,
  newName,
  setNewName,
  shareErr,
  setShareErr,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  newName: string;
  setNewName: (s: string) => void;
  shareErr: string | null;
  setShareErr: (s: string | null) => void;
}) {
  const wallet = useWallet();
  const total = totalSats(tab);
  const paid = paidTotal(tab);
  const remaining = remainingSats(tab);
  const shareUrl = useMemo(() => {
    const payload = encodeJson(tab);
    return `${window.location.origin}${window.location.pathname}#/t/${payload}`;
  }, [tab]);

  const update = (next: Tab) => {
    saveTab(next);
    setTab(next);
  };

  const addGuest = () => {
    if (!newName.trim()) return;
    const next = applyEqualSplit({
      ...tab,
      guests: [...tab.guests, { id: id('g'), name: newName.trim(), note: '', shareSats: 0, paidSats: 0, paidTxids: [] }],
    });
    update(next);
    setNewName('');
  };

  const setCustomShare = (guestId: string, bch: string) => {
    const sats = parseAmountToSats(bch);
    if (sats === null) return;
    update({
      ...tab,
      split: 'custom',
      guests: tab.guests.map((g) => (g.id === guestId ? { ...g, shareSats: Number(sats) } : g)),
    });
  };

  const acknowledgePayment = async (guest: Guest, txid: string, sats?: number) => {
    const amount = sats ?? guest.shareSats;
    const current = getTab(tab.id) ?? tab;
    const result = await acknowledgeOnTab(current, guest.id, txid, amount);
    if ('error' in result) {
      setShareErr(result.error);
      return;
    }
    setShareErr(result.warning ?? null);
    update(result.tab);
  };

  const shareIssue = assertSharesMatchTotal(tab);
  const isDemo = tab.id === 'demo-yumcha';

  return (
    <div className="wrap section">
      {isDemo ? (
        <p className="banner">
          This is the Chipnet yum cha demo. Payments go to {shortenAddress(DEMO_HOST.address)}. Do not send mainnet BCH
          here. Recovery WIF is in the README.{' '}
          <a href="#/demo/reset">Reset the demo tab</a>.
        </p>
      ) : null}
      {tab.network === 'mainnet' ? (
        <p className="banner">Mainnet tab — payments are real Bitcoin Cash sent to {shortenAddress(tab.hostAddress)}.</p>
      ) : null}

      <div className="split">
        <article className="receipt">
          <header>
            <p className="kicker">{tab.network === 'chipnet' ? 'Chipnet tab' : 'Mainnet tab'}</p>
            <h2>{tab.title}</h2>
            <p>
              {tab.place ? `${tab.place} · ` : ''}Hosted by {tab.hostName}
            </p>
          </header>
          {tab.items.map((it) => (
            <div className="line" key={it.id}>
              <span>{it.name}</span>
              <span className="qty">×{it.qty}</span>
              <span>{formatBch(BigInt(it.unitSats) * BigInt(it.qty), { unit: false })}</span>
            </div>
          ))}
          <div className="totals">
            <div className="line">
              <span>Subtotal</span>
              <span>{formatBch(subtotalSats(tab.items))}</span>
            </div>
            {tab.taxPct > 0 ? (
              <div className="line">
                <span>Tax {tab.taxPct}%</span>
                <span>{formatBch(taxSats(tab.items, tab.taxPct))}</span>
              </div>
            ) : null}
            {tab.tipPct > 0 ? (
              <div className="line">
                <span>Tip {tab.tipPct}%</span>
                <span>{formatBch(tipSats(tab.items, tab.tipPct))}</span>
              </div>
            ) : null}
            <div className="line grand">
              <span>Total</span>
              <span>{formatBch(total)}</span>
            </div>
            <div className="line">
              <span>Recorded as paid</span>
              <span>{formatBch(paid)}</span>
            </div>
            <div className="line">
              <span>Still open</span>
              <span>{formatBch(remaining)}</span>
            </div>
          </div>
          <p className="fine" style={{ marginTop: 18 }}>
            Pay to <span className="mono">{tab.hostAddress}</span>
          </p>
        </article>

        <div className="stack">
          <section className="panel pay-box">
            <p className="kicker">Share this tab</p>
            <h3>One link for the table</h3>
            <p className="fine mono">{shareUrl.slice(0, 72)}…</p>
            <div className="btn-row">
              <CopyButton text={shareUrl} label="Copy share link" />
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setShareErr(null);
                  if (shareUrl.length > 1800) {
                    setShareErr('This tab is large for some chat apps. Copy the link anyway, or save it on this device and show the receipt.');
                  }
                }}
              >
                Check link length
              </button>
            </div>
            {shareErr ? <p className="callout">{shareErr}</p> : null}
            <div style={{ marginTop: 12 }}>
              <QrCode value={shareUrl} label="Scan to open the tab" size={180} />
            </div>
          </section>

          {tab.network === 'chipnet' ? (
            <section className="callout">
              <strong>Need Chipnet coins?</strong>
              <div className="btn-row" style={{ marginTop: 8 }}>
                {faucetUrls('chipnet').map((f) => (
                  <a key={f.href} className="btn secondary" href={f.href} target="_blank" rel="noreferrer">
                    {f.label}
                  </a>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <section className="section">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2>Around the table</h2>
          <div className="btn-row">
            <button type="button" className="btn secondary" onClick={() => update(applyEqualSplit(tab))}>
              Re-split equally
            </button>
            {remaining > 0n ? (
              <button
                type="button"
                className="btn seal"
                onClick={() => navigate(`/lai?fromTab=${tab.id}&sats=${remaining.toString()}`)}
              >
                Turn the remainder into lai see
              </button>
            ) : null}
          </div>
        </div>
        {shareIssue ? <p className="error">{shareIssue}</p> : null}

        <div className="guest-list" style={{ marginTop: 16 }}>
          {tab.guests.map((g) => (
            <GuestRow
              key={g.id}
              tab={tab}
              guest={g}
              onShare={setCustomShare}
              onAcknowledge={acknowledgePayment}
              wallet={wallet}
            />
          ))}
        </div>

        <form
          className="btn-row"
          style={{ marginTop: 16 }}
          onSubmit={(e) => {
            e.preventDefault();
            addGuest();
          }}
        >
          <input
            type="text"
            value={newName}
            placeholder="Add yourself to this tab"
            onChange={(e) => setNewName(e.target.value)}
          />
          <button className="btn" type="submit">
            Join the tab
          </button>
        </form>
      </section>
    </div>
  );
}

function GuestRow({
  tab,
  guest,
  onShare,
  onAcknowledge,
  wallet,
}: {
  tab: Tab;
  guest: Guest;
  onShare: (id: string, bch: string) => void;
  onAcknowledge: (guest: Guest, txid: string, sats?: number) => Promise<void>;
  wallet: ReturnType<typeof useWallet>;
}) {
  const [txid, setTxid] = useState('');
  const [recordErr, setRecordErr] = useState<string | null>(null);
  const [walletMsg, setWalletMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const label = paymentLabel(guest);
  const due = BigInt(guest.shareSats) - BigInt(guest.paidSats);
  const settled = label === 'verified' && due <= 0n && guest.shareSats > 0;
  const intent = {
    network: tab.network,
    address: tab.hostAddress,
    sats: due > 0n ? due : BigInt(guest.shareSats),
    message: `${tab.memo} · ${guest.name}`.slice(0, 50),
  };
  const uri = bip21(intent);
  const badge =
    label === 'verified' ? 'Verified' : label === 'unverified' ? 'Recorded (unverified)' : 'Open';
  const badgeClass = label === 'verified' ? 'badge paid' : label === 'unverified' ? 'badge due' : 'badge due';

  const submitRecord = async () => {
    setRecordErr(null);
    try {
      await onAcknowledge(guest, txid, due > 0n ? Number(due) : guest.shareSats);
      setTxid('');
    } catch (err) {
      setRecordErr(err instanceof Error ? err.message : String(err));
    }
  };

  const payWithWallet = async () => {
    setWalletMsg(null);
    if (wallet.state !== 'connected' || !wallet.manager) {
      setWalletMsg('Pair a wallet first, or pay the BIP21 invoice.');
      return;
    }
    setBusy(true);
    try {
      const manager = asWalletManager(wallet.manager);
      const account = deriveReceiveAddress(manager, tab.network);
      if ('error' in account) {
        setWalletMsg(account.error);
        return;
      }
      const coins = await collectWalletUtxos(manager, tab.network);
      if (coins.error && coins.utxos.length === 0) {
        setWalletMsg(coins.error);
        return;
      }
      if (coins.utxos.length === 0) {
        setWalletMsg(
          'The connected wallet address has no spendable coins on this network (or no indexer replied). Fund it, or pay the BIP21 invoice instead.',
        );
        return;
      }
      const amount = due > 0n ? due : BigInt(guest.shareSats);
      const request = buildWalletSignRequest({
        utxos: coins.utxos,
        destination: tab.hostAddress,
        changeAddress: account.changeAddress,
        sendSats: amount,
        memo: `${tab.memo} · ${guest.name}`,
        userPrompt: `Pay ${guest.name}'s LaiTab share`,
      });
      if ('error' in request) {
        setWalletMsg(request.error);
        return;
      }
      const signed = await requestWalletSignature(manager, request);
      if ('error' in signed) {
        setWalletMsg(
          signed.cancelled
            ? 'The wallet cancelled or rejected the signature request.'
            : signed.error,
        );
        return;
      }
      const pushed = await broadcastTx(signed.hex, tab.network);
      let txidHex = pushed.txid;
      if (!txidHex) {
        try {
          txidHex = explorerTxid(hexToBin(signed.hex));
        } catch {
          txidHex = undefined;
        }
      }
      if (!txidHex) {
        setWalletMsg(
          `${pushed.error ?? 'Signed, but the transaction id could not be computed.'} Copy the hex from a wallet that can broadcast raw transactions.`,
        );
        return;
      }
      if (!pushed.accepted) {
        setWalletMsg(
          `Signed (${txidHex}). Broadcast was not accepted automatically: ${pushed.error ?? 'no indexer accepted the transaction.'} The share is recorded as unverified until a network confirmation can be checked.`,
        );
      } else {
        setWalletMsg(`Broadcast via ${pushed.source}: ${txidHex}`);
      }
      await onAcknowledge(guest, txidHex, Number(amount));
    } catch (err) {
      setWalletMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="guest">
      <div>
        <h3>
          {guest.name} <span className={badgeClass}>{badge}</span>
        </h3>
        <p className="muted">
          Share{' '}
          <input
            style={{ width: 140 }}
            defaultValue={fromSats(guest.shareSats)}
            onBlur={(e) => onShare(guest.id, e.target.value)}
            aria-label={`${guest.name} share in BCH`}
          />{' '}
          BCH
          {guest.paidSats > 0 ? ` · verified ${formatBch(guest.paidSats)}` : null}
        </p>
        {(guest.acknowledgements ?? guest.paidTxids.map((id) => ({ txid: id, status: 'unverified' as const }))).map(
          (t) => (
            <p key={t.txid} className="fine">
              <a href={explorerTxUrl(tab.network, t.txid)} target="_blank" rel="noreferrer">
                {t.txid.slice(0, 12)}…{t.txid.slice(-8)}
              </a>{' '}
              {t.status === 'verified' ? 'verified on-chain' : 'unverified acknowledgement'}
            </p>
          ),
        )}
      </div>
      <div className="amt">
        <div>{formatBch(due > 0n ? due : 0n)}</div>
        <div className="fine">{formatSats(due > 0n ? due : 0n)}</div>
        {!settled ? (
          <>
            <div style={{ margin: '10px 0' }}>
              <QrCode value={uri} size={132} label="Pay this share" />
            </div>
            <div className="btn-row">
              <a className="btn seal" href={uri}>
                Pay BIP21 invoice
              </a>
              <CopyButton text={uri} label="Copy BIP21" />
            </div>
            {wallet.state !== 'connected' ? (
              <button type="button" className="btn secondary" onClick={() => wallet.open()} style={{ marginTop: 8 }}>
                Pair WizardConnect
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => void payWithWallet()}
                  disabled={busy}
                  style={{ marginTop: 8 }}
                >
                  {busy ? 'Requesting signature…' : 'Request wallet signature'}
                </button>
                <p className="fine" style={{ marginTop: 8 }}>
                  The wallet is paired. A signature is requested only by this button. WizardConnect does not advertise
                  the chain; this request uses {tab.network}. If the wallet declines or has no coins, use the BIP21
                  invoice. Live Paytaca/Selene signing has not been observed in this build.
                </p>
              </>
            )}
            {walletMsg ? <p className="fine">{walletMsg}</p> : null}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submitRecord();
              }}
              style={{ marginTop: 10 }}
            >
              <label className="field">
                Record a transaction id (unverified until an indexer confirms it)
                <input value={txid} onChange={(e) => setTxid(e.target.value)} placeholder="64-character txid" />
              </label>
            </form>
            {recordErr ? <p className="error">{recordErr}</p> : null}
          </>
        ) : null}
      </div>
    </article>
  );
}
