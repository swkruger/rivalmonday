'use client';

import { Button, cn, Sheet, SheetContent, SheetTitle, SheetTrigger } from '@cs/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export type PanelEnv = 'dev' | 'demo' | 'test';
interface Link {
  label: string;
  email?: string;
  url: string;
}

/** Spec 5.1: fixed label and colour per database. */
const LOOK: Record<PanelEnv, { label: string; className: string }> = {
  dev: { label: 'DEV · real data', className: 'bg-[#F5A524] text-[#3B2300]' },
  demo: { label: 'DEMO', className: 'bg-[#2A6BAC] text-white' },
  test: { label: 'TEST · wiped by test runs', className: 'bg-[#6B7280] text-white' },
};
const POST = { method: 'POST', headers: { 'content-type': 'application/json', 'x-rm-dev-panel': '1' } } as const;

export function DevBanner({ env: initial }: { env: PanelEnv }) {
  const router = useRouter();
  const [env, setEnv] = useState<PanelEnv>(initial);
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<Link[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState<null | 'switch' | 'reset' | 'snapshot'>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadLinks = async () => {
    try {
      const r = await fetch('/dev-panel/api/links');
      setLinks(((await r.json()) as { links: Link[] }).links);
    } catch {
      setLinks([]);
    }
  };
  useEffect(() => {
    if (open) void loadLinks();
  }, [open, env]);

  async function switchTo(next: PanelEnv) {
    setBusy('switch');
    setMessage(null);
    try {
      const r = await fetch('/dev-panel/api/switch', { ...POST, body: JSON.stringify({ env: next }) });
      const body = (await r.json()) as { env?: PanelEnv; links?: Link[]; error?: string };
      if (!r.ok || !body.env) {
        setMessage(body.error ?? 'Switch failed');
        return;
      }
      setEnv(body.env);
      setLinks(body.links ?? []);
      setMessage(`Switched to ${body.env.toUpperCase()}. You are signed out; use a link below.`);
      router.refresh();
    } catch {
      setMessage('Switch failed');
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    setBusy('reset');
    setLog([]);
    try {
      const r = await fetch('/dev-panel/api/reset', POST);
      if (!r.ok || !r.body) {
        setLog([((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'Reset failed']);
        return;
      }
      const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const parts = buffer.split('\n');
        buffer = parts.pop() ?? '';
        setLog((l) => [...l, ...parts]);
      }
      if (buffer) setLog((l) => [...l, buffer]);
      await loadLinks();
      router.refresh();
    } catch {
      setLog((l) => [...l, 'Reset failed']);
    } finally {
      setBusy(null);
    }
  }

  async function snapshot() {
    setBusy('snapshot');
    setMessage(null);
    try {
      const r = await fetch('/dev-panel/api/snapshot', POST);
      const body = (await r.json()) as { ok?: boolean; folder?: string | null; output?: string[]; error?: string };
      setMessage(body.ok && body.folder ? `Snapshot written to ${body.folder}` : (body.error ?? body.output?.slice(-4).join('\n') ?? 'Snapshot failed'));
    } catch {
      setMessage('Snapshot failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        data-rm-dev-panel={env}
        aria-label={`Database: ${LOOK[env].label}. Open the dev panel`}
        className={cn('block w-full px-4 py-1 text-center text-xs font-bold tracking-wide', LOOK[env].className)}
      >
        {LOOK[env].label}
      </SheetTrigger>
      <SheetContent side="right" aria-describedby={undefined} className="w-[380px] gap-5">
        <SheetTitle>Dev panel</SheetTitle>
        <section aria-label="Database" className="flex flex-col gap-2">
          <p className="text-sm">Live database: <strong>{env.toUpperCase()}</strong></p>
          <div className="flex flex-wrap gap-2">
            {(['dev', 'demo', 'test'] as const).map((n) => (
              <Button key={n} size="sm" variant={n === env ? 'default' : 'outline'} disabled={busy !== null || n === env} onClick={() => void switchTo(n)}>
                Switch to {n.toUpperCase()}
              </Button>
            ))}
          </div>
        </section>
        <section aria-label="Sign in" className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">Sign in</h3>
          {links.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sign-in links for this database{env === 'demo' ? ' yet. Reset the demo data first.' : '.'}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {links.map((l) => (
                <li key={l.url}>
                  <a href={l.url} className="font-semibold text-primary-soft-text">{l.label}</a>
                  {l.email && <span className="block text-xs text-muted-foreground">{l.email}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
        {env === 'demo' && (
          <section aria-label="Demo data" className="flex flex-col gap-2">
            <Button size="sm" disabled={busy !== null} onClick={() => void reset()}>Reset demo data</Button>
            <pre data-testid="reset-log" className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted-surface p-2 text-xs">{log.join('\n')}</pre>
          </section>
        )}
        {env === 'dev' && (
          <section aria-label="Snapshot" className="flex flex-col gap-2">
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void snapshot()}>Take snapshot</Button>
          </section>
        )}
        {message && <p role="status" className="whitespace-pre-wrap text-sm">{message}</p>}
      </SheetContent>
    </Sheet>
  );
}
