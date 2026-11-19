export function pathFromHash(): string {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

/** Return the payload after a hash-route prefix, or null if the path does not match. */
export function payloadAfter(path: string, prefix: string): string | null {
  const clean = path.split('?')[0];
  if (!prefix.startsWith('/') || !prefix.endsWith('/') || !clean.startsWith(prefix)) return null;
  return clean.slice(prefix.length);
}

export function navigate(path: string) {
  const next = path.startsWith('#') ? path : `#${path.startsWith('/') ? path : '/' + path}`;
  if (window.location.hash === next) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  window.location.hash = next;
}

export function go(path: string) {
  return (e?: { preventDefault(): void }) => {
    e?.preventDefault();
    navigate(path);
  };
}
