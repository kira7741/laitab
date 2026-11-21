import { useMemo, useState } from 'react';
import { parseCashAddress } from '../lib/address';
import { applyEqualSplit, formatBch, fromSats, id, parseAmountToSats, subtotalSats, taxSats, tipSats, totalSats } from '../lib/money';
import { navigate } from '../lib/route';
import { saveTab } from '../lib/storage';
import type { Guest, LineItem, Network, Tab } from '../lib/types';

const emptyItem = (): LineItem => ({ id: id('i'), name: '', qty: 1, unitSats: 0 });
const emptyGuest = (name = ''): Guest => ({
  id: id('g'),
  name,
  note: '',
  shareSats: 0,
  paidSats: 0,
  paidTxids: [],
});

export function CreateTab() {
  const [step, setStep] = useState(0);
  const [network, setNetwork] = useState<Network>('chipnet');
  const [title, setTitle] = useState('');
  const [place, setPlace] = useState('');
  const [hostName, setHostName] = useState('');
  const [hostAddress, setHostAddress] = useState('');
  const [taxPct, setTaxPct] = useState('0');
  const [tipPct, setTipPct] = useState('10');
  const [items, setItems] = useState<LineItem[]>([emptyItem(), emptyItem()]);
  const [guests, setGuests] = useState<Guest[]>([emptyGuest(''), emptyGuest('')]);
  const [error, setError] = useState<string | null>(null);

  const tax = Number(taxPct) || 0;
  const tip = Number(tipPct) || 0;
  const draft = useMemo(
    () => ({ items, taxPct: tax, tipPct: tip }),
    [items, tax, tip],
  );
  const subtotal = subtotalSats(items);
  const total = totalSats(draft);

  const parsedHost = parseCashAddress(hostAddress, network);

  const publish = () => {
    setError(null);
    if (!title.trim() || !hostName.trim()) {
      setError('Give the tab a title and the host a name.');
      return;
    }
    if ('error' in parsedHost) {
      setError(parsedHost.error);
      return;
    }
    if (items.every((i) => !i.name.trim() || i.unitSats <= 0)) {
      setError('Add at least one priced item.');
      return;
    }
    const named = guests.filter((g) => g.name.trim());
    if (named.length === 0) {
      setError('Add at least one person on the tab.');
      return;
    }
    const cleanItems = items.filter((i) => i.name.trim() && i.qty > 0 && i.unitSats > 0);
    let tab: Tab = {
      v: 1,
      kind: 'tab',
      id: id('t'),
      createdAt: new Date().toISOString(),
      network,
      title: title.trim(),
      place: place.trim(),
      hostName: hostName.trim(),
      hostAddress: parsedHost.address,
      items: cleanItems,
      taxPct: tax,
      tipPct: tip,
      split: 'equal',
      guests: named.map((g) => ({ ...g, name: g.name.trim() })),
      memo: `LaiTab ${title.trim()}`.slice(0, 40),
    };
    tab = applyEqualSplit(tab);
    saveTab(tab);
    navigate(`/tab/${tab.id}`);
  };

  return (
    <div className="wrap section">
      <p className="eyebrow">New tab</p>
      <h1>Set the table</h1>
      <ul className="steps">
        {['Host', 'The bill', 'Who pays'].map((label, i) => (
          <li key={label} className={i === step ? 'on' : ''}>
            {i + 1}. {label}
          </li>
        ))}
      </ul>

      {step === 0 && (
        <div className="stack" style={{ maxWidth: 640 }}>
          <label className="field">
            What is this tab for?
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sunday yum cha, team dinner, wedding table…" />
          </label>
          <label className="field">
            Place <span className="muted">(optional)</span>
            <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Kowloon Bay Tea House" />
          </label>
          <div className="field-row">
            <label className="field">
              Host name
              <input value={hostName} onChange={(e) => setHostName(e.target.value)} placeholder="Your name" />
            </label>
            <label className="field">
              Network
              <select value={network} onChange={(e) => setNetwork(e.target.value as Network)}>
                <option value="chipnet">Chipnet (test coins)</option>
                <option value="mainnet">Mainnet (real BCH)</option>
              </select>
            </label>
          </div>
          <label className="field">
            Host CashAddr — where payments go
            <input
              value={hostAddress}
              onChange={(e) => setHostAddress(e.target.value)}
              placeholder={network === 'chipnet' ? 'bchtest:q…' : 'bitcoincash:q…'}
            />
          </label>
          {'error' in parsedHost && hostAddress.trim() ? <p className="error">{parsedHost.error}</p> : null}
          {network === 'mainnet' ? (
            <p className="banner">
              Mainnet sends real Bitcoin Cash. Double-check the address before you share the tab.
            </p>
          ) : (
            <p className="callout">Chipnet coins have no monetary value. Use a faucet, then a Chipnet-capable wallet.</p>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="stack">
          <div className="items-editor">
            {items.map((item, idx) => (
              <div className="item-row" key={item.id}>
                <input
                  value={item.name}
                  placeholder="Dish or drink"
                  onChange={(e) =>
                    setItems(items.map((it, i) => (i === idx ? { ...it, name: e.target.value } : it)))
                  }
                />
                <input
                  type="number"
                  min={1}
                  value={item.qty}
                  onChange={(e) =>
                    setItems(items.map((it, i) => (i === idx ? { ...it, qty: Math.max(1, Number(e.target.value) || 1) } : it)))
                  }
                />
                <input
                  inputMode="decimal"
                  placeholder="Price, BCH"
                  defaultValue={item.unitSats ? fromSats(item.unitSats) : ''}
                  onBlur={(e) => {
                    const sats = parseAmountToSats(e.target.value);
                    if (sats === null) return;
                    setItems(items.map((it, i) => (i === idx ? { ...it, unitSats: Number(sats) } : it)));
                  }}
                />
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setItems(items.filter((_, i) => i !== idx))}
                  disabled={items.length <= 1}
                >
                  Remove
                </button>
              </div>
            ))}
            <button type="button" className="btn secondary" onClick={() => setItems([...items, emptyItem()])}>
              Add a line
            </button>
          </div>
          <div className="field-row" style={{ maxWidth: 420 }}>
            <label className="field">
              Tax %
              <input value={taxPct} onChange={(e) => setTaxPct(e.target.value)} />
            </label>
            <label className="field">
              Tip %
              <input value={tipPct} onChange={(e) => setTipPct(e.target.value)} />
            </label>
          </div>
          <p>
            Subtotal {formatBch(subtotal)} · Tax {formatBch(taxSats(items, tax))} · Tip {formatBch(tipSats(items, tip))} ·{' '}
            <strong>Total {formatBch(total)}</strong>
          </p>
          <p className="fine">Prices are entered in BCH (up to 8 decimals) and stored as integer satoshis, so shares always add up.</p>
        </div>
      )}

      {step === 2 && (
        <div className="stack" style={{ maxWidth: 640 }}>
          {guests.map((g, idx) => (
            <div className="field-row" key={g.id}>
              <label className="field">
                Name
                <input
                  value={g.name}
                  onChange={(e) => setGuests(guests.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))}
                  placeholder={idx === 0 ? hostName || 'Host' : 'Guest'}
                />
              </label>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setGuests(guests.filter((_, i) => i !== idx))}
                disabled={guests.length <= 1}
              >
                Remove
              </button>
            </div>
          ))}
          <button type="button" className="btn secondary" onClick={() => setGuests([...guests, emptyGuest()])}>
            Add a person
          </button>
          <p className="muted">
            The bill starts as an equal split of {formatBch(total)}. You can adjust individual shares after it is published.
          </p>
        </div>
      )}

      {error ? <p className="error">{error}</p> : null}
      <div className="btn-row" style={{ marginTop: 22 }}>
        {step > 0 ? (
          <button type="button" className="btn secondary" onClick={() => setStep(step - 1)}>
            Back
          </button>
        ) : null}
        {step < 2 ? (
          <button type="button" className="btn" onClick={() => setStep(step + 1)}>
            Continue
          </button>
        ) : (
          <button type="button" className="btn seal" onClick={publish}>
            Publish this tab
          </button>
        )}
      </div>
    </div>
  );
}
