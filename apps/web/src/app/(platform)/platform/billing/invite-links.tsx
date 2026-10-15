'use client';
import { Button } from '@cs/ui';
import { useActionState, useState } from 'react';
import { Field, fieldCls, MiniForm } from '../_components/mini-form';
import { createInviteLinkAction, type InviteLinkResult, revokeInviteLinkAction } from './actions';

export interface LinkRow {
  id: string;
  tokenPrefix: string;
  offer: 'pilot' | 'trial';
  pilotEndsAt: string | null;
  maxUses: number;
  uses: number;
  expiresAt: string;
  note: string | null;
  revokedAt: string | null;
}

const status = (l: LinkRow) =>
  l.revokedAt ? 'Revoked' : Date.parse(l.expiresAt) <= Date.now() ? 'Expired' : l.uses >= l.maxUses ? 'Used up' : 'Active';

function CopyBox({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-muted-surface p-3">
      <label htmlFor="new-invite-url" className="sr-only">New invite link</label>
      <div className="flex gap-2">
        <input id="new-invite-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className={`${fieldCls} min-w-0 flex-1 font-mono`} />
        <Button
          type="button"
          variant="outline"
          onClick={() => void navigator.clipboard?.writeText(url).then(() => setCopied(true), () => setCopied(false))}
        >
          Copy
        </Button>
      </div>
      <p role="status" className="text-sm font-semibold text-ink">Copy link — it won&apos;t be shown again.</p>
      {copied && <p className="text-xs text-muted-foreground">Copied to clipboard.</p>}
    </div>
  );
}

/** Staff and owners: invite-link list (token prefix only) and create form. The full URL appears once, in this form's result. */
export function InviteLinks({ links, codes }: { links: LinkRow[]; codes: { id: string; code: string }[] }) {
  const [state, formAction, pending] = useActionState<InviteLinkResult, FormData>(createInviteLinkAction, { ok: true });
  const [offer, setOffer] = useState<'pilot' | 'trial'>('pilot');
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="text-muted-foreground">
              {['Link', 'Offer', 'Uses', 'Expires', 'Note', 'Status', ''].map((h, i) => (
                <th key={h || `x${i}`} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {links.map((l) => (
              <tr key={l.id} className="border-t border-[#EEF2F6]">
                <td className="px-3 py-2 font-mono">{l.tokenPrefix}…</td>
                <td className="px-3 py-2">{l.offer === 'pilot' ? 'Pilot' : 'Trial'}</td>
                <td className="px-3 py-2">{l.uses} / {l.maxUses}</td>
                <td className="whitespace-nowrap px-3 py-2">{l.expiresAt.slice(0, 10)}</td>
                <td className="px-3 py-2">{l.note ?? ''}</td>
                <td className="px-3 py-2">{status(l)}</td>
                <td className="px-3 py-2">
                  {!l.revokedAt && (
                    <MiniForm action={revokeInviteLinkAction} submit="Revoke" variant="outline" className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={l.id} />
                    </MiniForm>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {links.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">No invite links yet.</p>}
      </div>
      <form action={formAction} className="flex flex-wrap items-end gap-3 border-t border-[#EEF2F6] pt-4">
        <Field label="Offer" htmlFor="il-offer">
          <select id="il-offer" name="offer" value={offer} onChange={(e) => setOffer(e.target.value as 'pilot' | 'trial')} className={fieldCls}>
            <option value="pilot">Pilot</option>
            <option value="trial">Trial</option>
          </select>
        </Field>
        {offer === 'pilot' && <Field label="Pilot ends" htmlFor="il-pilot-end"><input id="il-pilot-end" name="pilotEndsAt" type="date" className={fieldCls} /></Field>}
        <Field label="Discount code (optional)" htmlFor="il-code">
          <select id="il-code" name="discountCodeId" defaultValue="" className={fieldCls}>
            <option value="">None</option>
            {codes.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
          </select>
        </Field>
        <Field label="Lock to email (optional)" htmlFor="il-email"><input id="il-email" name="emailLock" type="email" maxLength={254} className={`${fieldCls} w-56`} /></Field>
        <Field label="Max uses" htmlFor="il-max"><input id="il-max" name="maxUses" inputMode="numeric" defaultValue="1" className={`${fieldCls} w-20`} /></Field>
        <Field label="Expires in (days)" htmlFor="il-days"><input id="il-days" name="expiresInDays" inputMode="numeric" defaultValue="14" className={`${fieldCls} w-24`} /></Field>
        <Field label="Note (optional)" htmlFor="il-note"><input id="il-note" name="note" maxLength={500} className={`${fieldCls} w-56`} /></Field>
        <Button type="submit" disabled={pending}>Create link</Button>
        {!state.ok && <p role="alert" className="basis-full text-sm text-ink">{state.error}</p>}
      </form>
      {state.ok && 'url' in state && <CopyBox url={state.url} />}
    </div>
  );
}
