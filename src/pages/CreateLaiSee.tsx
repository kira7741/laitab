import { useMemo, useState } from 'react';
import { faucetUrls, shortenAddress } from '../lib/address';
import { bip21 } from '../lib/bip21';
import { encodeJson } from '../lib/codec';
import { encryptSecret } from '../lib/crypto-pass';
import { generateP2pkh } from '../lib/keys';
import { formatBch, fromSats, id, parseAmountToSats } from '../lib/money';
import { QrCode } from '../lib/qr';
import { getTab, savePacket } from '../lib/storage';
import type { LaiSeePacket, Network } from '../lib/types';
import { CopyButton } from '../components/CopyButton';

function params() {
  const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  return { fromTab: q.get('fromTab'), sats: q.get('sats') };
}

export function CreateLaiSee() {
  const initial = params();
  const fromTab = initial.fromTab ? getTab(initial.fromTab) : undefined;
  const [network, setNetwork] = useState<Network>(fromTab?.network ?? 'chipnet');
  const [fromName, setFromName] = useState(fromTab?.hostName ?? '');
  const [blessing, setBlessing] = useState('恭喜發財');
  const remainderSats = initial.sats && /^\d+$/.test(initial.sats) ? BigInt(initial.sats) : null;
  const [amount, setAmount] = useState(remainderSats && remainderSats > 0n ? fromSats(remainderSats) : '0.01');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [packet, setPacket] = useState<LaiSeePacket | null>(null);
  const [wifBackup, setWifBackup] = useState<string | null>(null);

  const sats = parseAmountToSats(amount);

  const create = async () => {
    setError(null);
    if (!fromName.trim()) {
      setError('Say who this packet is from.');
      return;
    }
    if (sats === null || sats <= 0n) {
      setError('Enter an amount in BCH (for example 0.01).');
      return;
    }
    setBusy(true);
    try {
      const key = await generateP2pkh(network);
      const base: LaiSeePacket = {
        v: 1,
        kind: 'laisee',
        id: id('p'),
        createdAt: new Date().toISOString(),
        network,
        fromName: fromName.trim(),
        blessing: blessing.trim() || '利是',
        expectedSats: Number(sats),
        address: key.address,
        locked: Boolean(pass),
        fromTabId: fromTab?.id,
      };
      if (pass) {
        base.enc = await encryptSecret(key.wif, pass);
      } else {
        base.wif = key.wif;
      }
      savePacket(base);
      setPacket(base);
      setWifBackup(key.wif);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (packet && wifBackup) return <IssuedPacket packet={packet} wifBackup={wifBackup} />;

  return (
    <div className="wrap section">
      <p className="eyebrow">Lai see</p>
      <h1>A red packet on Bitcoin Cash</h1>
      <p className="lede">
        LaiTab creates a fresh Chipnet or mainnet P2PKH address and a claim link. With a passphrase, the link stores
        an encrypted copy of the key. Without one, the link contains the key. This is not an on-chain hashlock, and
        there is no timeout refund. Creating the link does not fund the address.
      </p>
      <div className="split">
        <form className="stack" style={{ maxWidth: 560 }} onSubmit={(event) => event.preventDefault()}>
          {fromTab ? (
            <p className="callout">
              Remainder from <strong>{fromTab.title}</strong> is suggested as the amount. You can change it.
            </p>
          ) : null}
          <label className="field">
            From
            <input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Your name" />
          </label>
          <label className="field">
            Blessing
            <input value={blessing} onChange={(e) => setBlessing(e.target.value)} placeholder="恭喜發財" />
          </label>
          <div className="field-row">
            <label className="field">
              Amount (BCH)
              <input value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="field">
              Network
              <select value={network} onChange={(e) => setNetwork(e.target.value as Network)}>
                <option value="chipnet">Chipnet</option>
                <option value="mainnet">Mainnet</option>
              </select>
            </label>
          </div>
          <label className="field">
            Optional passphrase (recommended on mainnet)
            <input
              type="password"
              name="lai-see-passphrase"
              autoComplete="new-password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="A word you can say at the table"
            />
          </label>
          <p className="fine">
            Anyone with the unlocked key can sweep the coins. Keep the backup WIF until the packet is claimed. If the
            passphrase is lost and that backup was not saved, the coins cannot be recovered. There is no timeout that
            returns them. This prototype is unaudited — do not lock a large amount.
          </p>
          {network === 'mainnet' && !pass ? (
            <p className="banner">A mainnet packet without a passphrase is like cash in an unsealed envelope.</p>
          ) : null}
          {error ? <p className="error">{error}</p> : null}
          <button className="btn seal" type="button" disabled={busy} onClick={() => void create()}>
            {busy ? 'Sealing…' : 'Seal this lai see'}
          </button>
        </form>
        <aside className="laisee">
          <p className="kicker" style={{ color: '#f3d27a' }}>預覽</p>
          <h2>{blessing || '利是'}</h2>
          <p>From {fromName || '—'}</p>
          <p>{sats && sats > 0n ? formatBch(sats) : 'Choose an amount'}</p>
          <div className="coin">利</div>
        </aside>
      </div>
    </div>
  );
}

function IssuedPacket({ packet, wifBackup }: { packet: LaiSeePacket; wifBackup: string }) {
  const fundUri = bip21({
    network: packet.network,
    address: packet.address,
    sats: BigInt(packet.expectedSats),
    message: `Lai see · ${packet.blessing}`,
  });
  const claimUrl = useMemo(() => {
    const payload = encodeJson(packet);
    return `${window.location.origin}${window.location.pathname}#/claim/${payload}`;
  }, [packet]);

  return (
    <div className="wrap section">
      <p className="ok">The packet is sealed. Fund the address, then send the claim link — not the backup WIF.</p>
      <div className="split">
        <aside className="laisee">
          <p className="kicker" style={{ color: '#f3d27a' }}>{packet.network}</p>
          <h2>{packet.blessing}</h2>
          <p>From {packet.fromName}</p>
          <p>{formatBch(packet.expectedSats)}</p>
          <div className="coin">利</div>
        </aside>
        <div className="stack">
          <section className="panel pay-box">
            <h3>1. Fund this address</h3>
            <p className="mono fine">{packet.address}</p>
            <QrCode value={fundUri} label="Fund the packet" size={180} />
            <div className="btn-row">
              <a className="btn seal" href={fundUri}>
                Open funding invoice
              </a>
              <CopyButton text={packet.address} label="Copy address" />
            </div>
            {packet.network === 'chipnet' ? (
              <div className="btn-row" style={{ marginTop: 8 }}>
                {faucetUrls('chipnet').map((f) => (
                  <a key={f.href} className="btn secondary" href={f.href} target="_blank" rel="noreferrer">
                    {f.label}
                  </a>
                ))}
              </div>
            ) : null}
          </section>
          <section className="panel pay-box">
            <h3>2. Share the claim link</h3>
            <p className="fine">
              {packet.locked
                ? 'The link is locked. Tell the recipient the passphrase separately.'
                : 'Anyone with this link can sweep the packet once it is funded.'}
            </p>
            <p className="mono fine">{claimUrl.slice(0, 80)}…</p>
            <div className="btn-row">
              <CopyButton text={claimUrl} label="Copy claim link" />
              <a className="btn secondary" href={`#/claim/${encodeJson(packet)}`}>
                Open claim page
              </a>
            </div>
            <div style={{ marginTop: 12 }}>
              <QrCode value={claimUrl} label="Claim this lai see" size={180} />
            </div>
          </section>
          <section className="callout">
            <h3>Host backup — keep this private</h3>
            <p>
              If the claim link is lost, you can still recover funds with this WIF. Do not put it in the same message
              as the claim link.
            </p>
            <p className="mono">{wifBackup}</p>
            <p className="fine">Address {shortenAddress(packet.address)}</p>
            <CopyButton text={wifBackup} label="Copy backup WIF" />
          </section>
        </div>
      </div>
    </div>
  );
}
