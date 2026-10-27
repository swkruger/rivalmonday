'use client';
import { pilotLinkRefusal } from '@cs/core/invite-offer';
import { Button, Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from '@cs/ui';
import { useActionState, useState } from 'react';
import { ErrorNote } from '@/components/form-error';
import { formatDate } from '@/lib/format';
import { Field, fieldCls } from '../_components/mini-form';
import { ConfirmForm } from '@/components/confirm-form';
import { createInviteLinkAction, type InviteLinkResult, revokeInviteLinkAction } from './actions';
import { endOfDayIso, toInt } from './parse';

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
    <div className="flex flex-col gap-2 rounded-md bg-muted-surface p-4">
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
      {copied && <p className="text-xs text-muted-ink">Copied to clipboard.</p>}
    </div>
  );
}

/** Staff and owners: invite-link list (token prefix only) and create form. The full URL appears once, in this form's result. */
export function InviteLinks({ links, codes, tz }: { links: LinkRow[]; codes: { id: string; code: string }[]; tz: string }) {
  const [state, formAction, pending] = useActionState<InviteLinkResult, FormData>(createInviteLinkAction, { ok: true });
  const [offer, setOffer] = useState<'pilot' | 'trial'>('pilot');
  const [pilotEnd, setPilotEnd] = useState('');
  const [days, setDays] = useState('14');
  // Live hint only: the server check in create_invite_link is binding, so submit stays enabled.
  const endIso = endOfDayIso(pilotEnd);
  const daysN = toInt(days || '14'); // blank posts as the action's 14-day default
  const now = new Date();
  const hint = offer === 'pilot' && endIso && daysN !== null
    ? pilotLinkRefusal(new Date(endIso), new Date(now.getTime() + daysN * 86_400_000), now)
    : null;
  return (
    <div className="flex flex-col gap-4">
      {links.length === 0 ? (
        <p className="text-sm text-muted-ink">No invite links yet.</p>
      ) : (
        <TableFrame>
          <Table>
            <TableHeader>
              <TableRow>
                {['Link', 'Offer', 'Uses', 'Expires', 'Note', 'Status', ''].map((h, i) => (
                  <TableHead key={h || `x${i}`}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-mono">{l.tokenPrefix}…</TableCell>
                  <TableCell>{l.offer === 'pilot' ? 'Pilot' : 'Trial'}</TableCell>
                  <TableCell>{l.uses} / {l.maxUses}</TableCell>
                  <TableCell>{formatDate(l.expiresAt, { tz })}</TableCell>
                  <TableCell>{l.note ?? ''}</TableCell>
                  <TableCell>{status(l)}</TableCell>
                  <TableCell>
                    {!l.revokedAt && (
                      <ConfirmForm
                        action={revokeInviteLinkAction}
                        submit="Revoke"
                        variant="outline"
                        title="Revoke this invite link?"
                        body="Nobody can join through it afterwards. Agencies that already joined stay."
                        confirmLabel="Revoke link"
                        tone="danger"
                        fields={{ id: l.id }}
                        className="flex flex-wrap items-center gap-2"
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      )}
      <form action={formAction} className="flex flex-wrap items-end gap-3 border-t border-line pt-4">
        <Field label="Offer" htmlFor="il-offer">
          <select id="il-offer" name="offer" value={offer} onChange={(e) => setOffer(e.target.value as 'pilot' | 'trial')} className={fieldCls}>
            <option value="pilot">Pilot</option>
            <option value="trial">Trial</option>
          </select>
        </Field>
        {offer === 'pilot' && <Field label="Pilot ends" htmlFor="il-pilot-end"><input id="il-pilot-end" name="pilotEndsAt" type="date" value={pilotEnd} onChange={(e) => setPilotEnd(e.target.value)} className={fieldCls} /></Field>}
        <Field label="Discount code (optional)" htmlFor="il-code">
          <select id="il-code" name="discountCodeId" defaultValue="" className={fieldCls}>
            <option value="">None</option>
            {codes.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
          </select>
        </Field>
        <Field label="Lock to email (optional)" htmlFor="il-email"><input id="il-email" name="emailLock" type="email" maxLength={254} className={`${fieldCls} w-56`} /></Field>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="emailIt" className="size-4" />Email it to the locked address</label>
        <Field label="Max uses" htmlFor="il-max"><input id="il-max" name="maxUses" inputMode="numeric" defaultValue="1" className={`${fieldCls} w-20`} /></Field>
        <Field label="Expires in (days)" htmlFor="il-days"><input id="il-days" name="expiresInDays" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} className={`${fieldCls} w-24`} /></Field>
        <Field label="Note (optional)" htmlFor="il-note"><input id="il-note" name="note" maxLength={500} className={`${fieldCls} w-56`} /></Field>
        <Button type="submit" disabled={pending}>Create link</Button>
        {hint && (state.ok || state.error !== hint) && <ErrorNote compact quiet className="basis-full">{hint}</ErrorNote>}
        {!state.ok && <ErrorNote compact className="basis-full" focusKey={state}>{state.error}</ErrorNote>}
      </form>
      {state.ok && 'notice' in state && state.notice && <p role="alert" className="text-sm text-ink">{state.notice}</p>}
      {state.ok && 'url' in state && <CopyBox url={state.url} />}
    </div>
  );
}
