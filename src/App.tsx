import { lazy, Suspense, useEffect, useState } from 'react';
import { decodeJson } from './lib/codec';
import { demoTab } from './lib/demo';
import { applyEqualSplit } from './lib/money';
import { pathFromHash, payloadAfter } from './lib/route';
import { getTab, saveTab } from './lib/storage';
import type { Tab } from './lib/types';
import { Shell } from './components/Shell';
import { WizardProvider } from './wallet/Wizard';

const Home = lazy(() => import('./pages/Home').then((m) => ({ default: m.Home })));
const About = lazy(() => import('./pages/About').then((m) => ({ default: m.About })));
const CreateTab = lazy(() => import('./pages/CreateTab').then((m) => ({ default: m.CreateTab })));
const CreateLaiSee = lazy(() => import('./pages/CreateLaiSee').then((m) => ({ default: m.CreateLaiSee })));
const TabView = lazy(() => import('./pages/TabView').then((m) => ({ default: m.TabView })));
const Claim = lazy(() => import('./pages/Claim').then((m) => ({ default: m.Claim })));

export function App() {
  const [path, setPath] = useState(pathFromHash);
  useEffect(() => {
    const on = () => setPath(pathFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  return (
    <WizardProvider>
      <Shell>
        <Suspense fallback={<div className="wrap section muted">Opening…</div>}>
          <Route path={path} />
        </Suspense>
      </Shell>
    </WizardProvider>
  );
}

function Route({ path }: { path: string }) {
  const clean = path.split('?')[0];
  if (clean === '/' || clean === '') return <Home />;
  if (clean === '/new') return <CreateTab />;
  if (clean === '/lai') return <CreateLaiSee />;
  if (clean === '/about') return <About />;
  if (clean === '/demo') {
    const existing = getTab('demo-yumcha');
    const tab = existing ?? applyEqualSplit(demoTab());
    if (!existing) saveTab(tab);
    return <TabView shared={tab} />;
  }
  if (clean === '/demo/reset') {
    const tab = applyEqualSplit(demoTab());
    saveTab(tab);
    return <TabView shared={tab} />;
  }
  const tabId = payloadAfter(clean, '/tab/');
  if (tabId !== null) return <TabView tabId={tabId} />;
  const sharedPayload = payloadAfter(clean, '/t/');
  if (sharedPayload !== null) {
    try {
      const tab = decodeJson<Tab>(sharedPayload);
      return <TabView shared={tab} />;
    } catch {
      return (
        <div className="wrap section">
          <h1>This share link could not be read</h1>
          <p className="muted">Ask the host to copy the link again from the tab page.</p>
        </div>
      );
    }
  }
  const claimPayload = payloadAfter(clean, '/claim/');
  if (claimPayload !== null) return <Claim payload={claimPayload} />;
  const packetId = payloadAfter(clean, '/packet/');
  if (packetId !== null) return <Claim packetId={packetId} />;
  return (
    <div className="wrap section">
      <h1>Not found</h1>
      <p>
        <a href="#/">Back to LaiTab</a>
      </p>
    </div>
  );
}
