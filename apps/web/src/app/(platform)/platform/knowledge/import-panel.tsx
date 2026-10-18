'use client';
import { Button } from '@cs/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { type ImportStatusResult, importErrorCopy, type StartImportResult } from './import-errors';
import { type KbTargets, ScopeFields } from './scope-fields';
import { ErrorNote } from '@/components/form-error';

export const POLL_MS = 2000;
type Phase = { kind: 'idle' } | { kind: 'working'; key: string } | { kind: 'error'; message: string };

/** Starts a URL import and polls its status every 2 s until the draft exists (routes to it) or the import fails. */
export function ImportPanel({
  targets,
  start,
  status,
}: {
  targets: KbTargets;
  start: (fd: FormData) => Promise<StartImportResult>;
  status: (key: string) => Promise<ImportStatusResult>;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  const key = phase.kind === 'working' ? phase.key : null;

  useEffect(() => {
    if (!key) return;
    let busy = false;
    const timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const r = await status(key);
        if (!alive.current) return;
        if (!r.ok) {
          clearInterval(timer);
          return setPhase({ kind: 'error', message: r.error });
        }
        if (r.status.state === 'done' && r.status.articleId) {
          clearInterval(timer);
          router.push(`/platform/knowledge/${r.status.articleId}`);
        } else if (r.status.state === 'failed' || r.status.state === 'done') {
          clearInterval(timer);
          setPhase({ kind: 'error', message: importErrorCopy(r.status.error) });
        }
      } catch {
        clearInterval(timer);
        if (alive.current) setPhase({ kind: 'error', message: importErrorCopy(undefined) });
      } finally {
        busy = false;
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [key, status, router]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const r = await start(new FormData(e.currentTarget));
    setPhase(r.ok ? { kind: 'working', key: r.key } : { kind: 'error', message: r.error });
  }

  return (
    <section aria-labelledby="kb-import-h" className="flex flex-col gap-3 rounded-[14px] bg-surface p-6 shadow-card">
      <h2 id="kb-import-h" className="text-lg font-bold">Import from a URL</h2>
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-semibold md:col-span-2">
          URL
          <input name="url" type="url" required placeholder="https://" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs" />
        </label>
        <ScopeFields targets={targets} idPrefix="import" initial={{ kind: 'blog' }} />
        <label className="flex items-center gap-2 text-sm font-semibold md:self-end md:pb-2">
          <input type="checkbox" name="autoSync" defaultChecked /> Auto-sync weekly
        </label>
        <div className="md:col-span-2">
          <Button type="submit" disabled={phase.kind === 'working'}>Import</Button>
        </div>
      </form>
      {phase.kind === 'working' && <p role="status" className="text-sm text-muted-foreground">Importing… this can take a minute.</p>}
      {phase.kind === 'error' && <ErrorNote>{phase.message}</ErrorNote>}
    </section>
  );
}
