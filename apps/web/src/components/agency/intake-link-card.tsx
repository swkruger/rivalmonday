'use client';
import { Button, Card, CardContent, CardHeader, CardTitle, Switch } from '@cs/ui';
import { useActionState, useOptimistic, useState, useTransition } from 'react';
import { useReadOnly } from '@/components/read-only';
import type { FormResult } from '@/server/forms';

export interface IntakeLinkState {
  slug: string | null;
  enabled: boolean;
  url: string | null;
  counts: { newThisMonth: number; accepted: number };
}

type SaveAction = (prev: FormResult, fd: FormData) => Promise<FormResult>;
type ToggleAction = (enabled: boolean) => Promise<FormResult>;

const fieldCls = 'h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';
export const BUTTON_TEXT = 'Get your free competitor snapshot';

/** The snippet an agency pastes into its website (inline styles only: it must work in any page builder). */
const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function buttonHtml(url: string): string {
  return `<a href="${escapeAttr(url)}" style="display:inline-block;background:#47A8E7;color:#ffffff;font-family:Inter,Arial,sans-serif;font-weight:700;font-size:16px;line-height:1;text-decoration:none;padding:14px 22px;border-radius:8px">${BUTTON_TEXT}</a>`;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <Button
      type="button"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState('copied');
        } catch {
          setState('failed');
        }
      }}
    >
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}
    </Button>
  );
}

/** Phase 11c §5: the agency's public intake link. The save result stays mounted (not inside anything revalidation unmounts). */
export function IntakeLinkCard({ link, save, toggle }: { link: IntakeLinkState; save: SaveAction; toggle: ToggleAction }) {
  const readOnly = useReadOnly();
  const [saved, saveAction, saving] = useActionState(save, { ok: true } as FormResult);
  const [enabled, setEnabled] = useOptimistic(link.enabled);
  const [toggled, setToggled] = useState<FormResult>({ ok: true });
  const [pending, startTransition] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Intake link</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">Share this link, or add the button to your website. Visitors search for their business and get a free competitor snapshot; you decide who to accept.</p>
        {link.url ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded-md bg-muted-surface px-2 py-1 text-sm text-ink">{link.url}</code>
              <CopyButton text={link.url} label="Copy link" />
              <CopyButton text={buttonHtml(link.url)} label="Copy button HTML" />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={enabled}
                disabled={pending || readOnly}
                aria-label="Accepting new leads"
                onCheckedChange={(next: boolean) => {
                  if (pending) return;
                  startTransition(async () => {
                    setEnabled(next);
                    setToggled(await toggle(next));
                  });
                }}
              />
              <span className="text-sm">{enabled ? 'Accepting new leads' : 'Switched off — visitors see that the page is unavailable'}</span>
            </div>
            {!toggled.ok && <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">{toggled.error}</p>}
          </div>
        ) : (
          <p className="text-sm">No link yet. Choose a name below, or leave it empty and we will use your agency name.</p>
        )}
        {!readOnly && (
          <form action={saveAction} onReset={(e) => e.preventDefault()} className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1 text-sm">
              <label htmlFor="intake-slug" className="font-medium">Link name</label>
              <input id="intake-slug" name="slug" defaultValue={link.slug ?? ''} maxLength={40} autoComplete="off" className={fieldCls} />
            </div>
            <Button type="submit" disabled={saving}>{link.url ? 'Save' : 'Create link'}</Button>
            {!saved.ok && <p role="alert" className="basis-full text-sm text-ink">{saved.error}</p>}
            {saved.ok && saved.message && <p role="status" className="basis-full text-sm text-ink">{saved.message}</p>}
          </form>
        )}
        <dl className="grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm">
          <div><dt className="text-muted-foreground">New this month</dt><dd className="text-lg font-bold">{link.counts.newThisMonth}</dd></div>
          <div><dt className="text-muted-foreground">Accepted</dt><dd className="text-lg font-bold">{link.counts.accepted}</dd></div>
        </dl>
      </CardContent>
    </Card>
  );
}
