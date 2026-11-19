import { useEffect, useState } from 'react';
import { addressError, explorerTxUrl, isAddressOk, parseCashAddress, shortenAddress } from '../lib/address';
import { decodeJson } from '../lib/codec';
import { decryptSecret } from '../lib/crypto-pass';
import { broadcastTx, fetchUtxos, parseManualUtxos, utxoSum, type Utxo } from '../lib/indexer';
import { keyFromWif } from '../lib/keys';
import { formatBch, formatSats } from '../lib/money';
import { getPacket, mergeClaimPacket, savePacket } from '../lib/storage';
import { MAX_MEMO_BYTES, utf8Truncate } from '../lib/memo';
import { buildP2pkhSend } from '../lib/sweep';
import type { LaiSeePacket } from '../lib/types';
import { CopyButton } from '../components/CopyButton';

export function Claim({ payload, packetId }: { payload?: string; packetId?: string }) {
  const [packet, setPacket] = useState<LaiSeePacket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pass, setPass] = useState('');
  const [wif, setWif] = useState<string | null>(null);
  const [dest, setDest] = useState('');
  const [utxos, setUtxos] = useState<Utxo[]>([]);
  const [idxMsg, setIdxMsg] = useState<string>('Looking up unspent coins…');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ hex: string; txid: string; fee: bigint; amount: bigint; broadcast?: string } | null>(
    null,
  );
  const [manual, setManual] = useState('');

  useEffect(() => {
    try {
      if (payload) {
        const p = decodeJson<LaiSeePacket>(payload);
        const merged = mergeClaimPacket(p, getPacket(p.id));
        setPacket(merged);
        savePacket(merged);
        if (merged.wif) setWif(merged.wif);
      } else if (packetId) {
        const p = getPacket(packetId);
        if (!p) setError('No packet with that id is saved in this browser.');
        else {
          setPacket(p);
          if (p.wif) setWif(p.wif);
        }
      }
    } catch {
      setError('This claim link is damaged or incomplete.');
    }
  }, [payload, packetId]);

  useEffect(() => {
    if (!packet) return;
    const address = packet.address;
    void (async () => {
      const { utxos: found, status } = await fetchUtxos(address, packet.network);
      setUtxos(found);
      if (status.ok) setIdxMsg(found.length ? `Found ${found.length} unspent output(s) via ${status.source}.` : 'The packet address has no unspent coins yet. Fund it first.');
      else setIdxMsg(status.error ?? 'Indexer unavailable.');
    })();
  }, [packet]);

  const unlock = async () => {
    if (!packet?.enc) return;
    setError(null);
    try {
      const unlocked = await decryptSecret(packet.enc, pass);
      setWif(unlocked);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const claim = async () => {
    if (!packet || !wif) return;
    setError(null);
    const parsed = parseCashAddress(dest, packet.network);
    if ('error' in parsed) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    try {
      const key = await keyFromWif(wif, packet.network);
      if (key.address !== packet.address) {
        throw new Error('The unlocked key does not match this packet address.');
      }
      let coins = utxos;
      if (coins.length === 0) {
        const again = await fetchUtxos(packet.address, packet.network);
        coins = again.utxos;
        setUtxos(coins);
        if (!again.status.ok) throw new Error(again.status.error ?? 'Could not look up the packet balance.');
        if (coins.length === 0) throw new Error('No coins to claim yet. Ask the sender to fund the packet address.');
      }
      const swept = buildP2pkhSend({
        utxos: coins,
        privateKey: key.privateKey,
        destination: parsed.address,
        memo: utf8Truncate(`LaiTab ${packet.blessing}`, MAX_MEMO_BYTES),
      });
      const pushed = await broadcastTx(swept.hex, packet.network);
      setResult({
        ...swept,
        broadcast: pushed.accepted && pushed.txid
          ? `Broadcast via ${pushed.source}: ${pushed.txid}`
          : pushed.error ?? 'Signed locally, but not broadcast.',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (error && !packet) return <div className="wrap section error">{error}</div>;
  if (!packet) return <div className="wrap section">Opening the packet…</div>;

  const balance = utxoSum(utxos);

  if (result) {
    return (
      <div className="wrap section">
        <p className="ok">
          {result.broadcast?.startsWith('Broadcast')
            ? `The lai see sweep was signed and ${result.broadcast}`
            : `The lai see sweep has been signed, but it has not been accepted by the network yet. ${result.broadcast ?? ''} Broadcast the hex below if you want it to land.`}
        </p>
        <h1>{packet.blessing}</h1>
        <p>
          {formatBch(result.amount)} swept to {shortenAddress(dest)} · fee {formatSats(result.fee)}
        </p>
        <p>
          Transaction{' '}
          <a href={explorerTxUrl(packet.network, result.txid)} target="_blank" rel="noreferrer">
            {result.txid}
          </a>
        </p>
        <label className="field">
          Raw transaction hex
          <textarea readOnly value={result.hex} />
        </label>
        <CopyButton text={result.hex} label="Copy hex" />
        <p className="fine">
          If automatic broadcast failed, paste this hex into a Chipnet or mainnet explorer push form, or a wallet that
          can broadcast raw transactions.
        </p>
      </div>
    );
  }

  return (
    <div className="wrap section">
      <div className="split">
        <aside className="laisee">
          <p className="kicker" style={{ color: '#f3d27a' }}>{packet.network}</p>
          <h2>{packet.blessing}</h2>
          <p>From {packet.fromName}</p>
          <p>Expected {formatBch(packet.expectedSats)}</p>
          <div className="coin">利</div>
        </aside>
        <div className="stack">
          <p className="mono fine">{packet.address}</p>
          <p className="muted">{idxMsg}</p>
          {balance > 0n ? <p><strong>On-chain balance {formatBch(balance)}</strong></p> : null}

          {packet.locked && !wif ? (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                void unlock();
              }}
            >
              <label className="field">
                Passphrase
                <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
              </label>
              <button className="btn seal" type="submit">
                Unlock
              </button>
            </form>
          ) : null}

          {wif ? (
            <>
              <label className="field">
                Sweep to this CashAddr
                <input
                  value={dest}
                  onChange={(e) => setDest(e.target.value)}
                  placeholder={packet.network === 'chipnet' ? 'bchtest:q…' : 'bitcoincash:q…'}
                />
              </label>
              {dest && !isAddressOk(dest, packet.network) ? (
                <p className="error">{addressError(dest, packet.network)}</p>
              ) : null}
              <button className="btn seal" type="button" disabled={busy} onClick={() => void claim()}>
                {busy ? 'Signing…' : 'Claim this lai see'}
              </button>
              <p className="fine">
                The browser signs a P2PKH sweep with libauth. If an indexer is reachable, the transaction is broadcast
                automatically. Otherwise you get a hex to push yourself.
              </p>
            </>
          ) : !packet.locked ? (
            <p className="error">This claim link does not include a key.</p>
          ) : null}

          <label className="field">
            If the indexer is down, paste UTXOs
            <textarea
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder={'txid:vout:satoshis\nor JSON from an explorer'}
            />
          </label>
          {manual.trim() ? (
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                const parsed = parseManualUtxos(manual);
                if ('error' in parsed) setError(parsed.error);
                else {
                  setUtxos(parsed.utxos);
                  setIdxMsg(`Using ${parsed.utxos.length} manually entered unspent output(s).`);
                  setError(null);
                }
              }}
            >
              Use these UTXOs
            </button>
          ) : null}
          {error ? <p className="error">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
