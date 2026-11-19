import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlphanumericQRCode, useWizardConnect } from '@wizardconnect/react';
import { asWalletManager, deriveReceiveAddress, type WalletAccount } from './adapter';
import { shortenAddress } from '../lib/address';

type WizardApi = ReturnType<typeof useWizardConnect> & {
  open: () => void;
};

const WizardCtx = createContext<WizardApi | null>(null);

export function WizardProvider({ children }: { children: ReactNode }) {
  const wizard = useWizardConnect({
    dappName: 'LaiTab',
    dappIcon: `${typeof window !== 'undefined' ? window.location.origin : ''}/favicon.svg`,
    persistSession: true,
    sessionKey: 'laitab-wizardconnect',
  });
  const [manualOpen, setManualOpen] = useState(false);

  const api = useMemo<WizardApi>(
    () => ({
      ...wizard,
      open: () => {
        const started = wizard.connect();
        if (started || wizard.qrUri) setManualOpen(true);
      },
    }),
    [wizard],
  );

  const showQr = Boolean((manualOpen || wizard.state === 'connecting') && wizard.qrUri && wizard.state !== 'connected');

  return (
    <WizardCtx.Provider value={api}>
      {children}
      {showQr && wizard.uri && wizard.qrUri ? (
        <div className="modal-backdrop" onClick={() => setManualOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Connect a Bitcoin Cash wallet</h2>
            <p className="muted">
              Scan this WizardConnect code with a compatible wallet. This pairs a relay session. A signature is
              requested only when you later choose “Request wallet signature” on a share — pairing alone does not
              send coins. BIP21 invoices remain available if the wallet cannot sign.
            </p>
            <div style={{ display: 'grid', placeItems: 'center', margin: '12px 0' }}>
              <AlphanumericQRCode value={wizard.qrUri} size={260} foreground="#1a0f0c" background="#fbf7ef" />
            </div>
            <p className="mono fine">{wizard.uri}</p>
            <div className="btn-row">
              <button
                className="btn secondary"
                type="button"
                onClick={() => navigator.clipboard.writeText(wizard.uri ?? '')}
              >
                Copy URI
              </button>
              <button className="btn" type="button" onClick={() => setManualOpen(false)}>
                Close
              </button>
            </div>
            {wizard.error ? <p className="error">{wizard.error}</p> : null}
          </div>
        </div>
      ) : null}
    </WizardCtx.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WizardCtx);
  if (!ctx) throw new Error('useWallet must be used inside WizardProvider');
  return ctx;
}

export function useWalletAccount(): { account: WalletAccount | null; error: string | null } {
  const w = useWallet();
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (w.state !== 'connected' || !w.manager) {
      setAccount(null);
      setError(null);
      return;
    }
    const read = () => {
      const derived = deriveReceiveAddress(asWalletManager(w.manager!), 'chipnet');
      if ('error' in derived) {
        setAccount(null);
        setError(derived.error);
        return;
      }
      setAccount(derived);
      setError(null);
    };
    read();
    const onReady = () => read();
    w.manager.on('walletready', onReady);
    return () => {
      w.manager?.off('walletready', onReady);
    };
  }, [w.state, w.manager]);

  return { account, error };
}

export function WalletBar() {
  const w = useWallet();
  const { account, error } = useWalletAccount();
  if (w.state === 'connected') {
    return (
      <span className="wallet-chip">
        <span className="wallet-dot on" />
        {w.walletName ?? 'Wallet paired'}
        {account ? (
          <span className="fine" title={account.receiveAddress}>
            {shortenAddress(account.receiveAddress)}
          </span>
        ) : error ? (
          <span className="fine">Paired — no account key yet</span>
        ) : (
          <span className="fine">Waiting for account keys</span>
        )}
        <button className="btn ghost" type="button" onClick={() => void w.disconnect()}>
          Disconnect
        </button>
      </span>
    );
  }
  return (
    <button className="btn secondary" type="button" onClick={() => w.open()}>
      {w.state === 'connecting' || w.state === 'reconnecting' ? 'Connecting…' : 'Connect wallet'}
    </button>
  );
}
