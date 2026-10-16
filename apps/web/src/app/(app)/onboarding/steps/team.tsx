'use client';
import { Button, Input, Label } from '@cs/ui';
import { useActionState, useRef, useState } from 'react';
import { FormError } from '@/components/form-error';
import { WriteGuard } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import { inviteTeamAction } from '../actions';
import { StepNav } from '../step-nav';

const selectClass = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

export function TeamStep() {
  const [state, formAction, pending] = useActionState(inviteTeamAction, { ok: true } as FormResult);
  const [rows, setRows] = useState([0]);
  const [emails, setEmails] = useState<Record<number, string>>({});
  const [asking, setAsking] = useState(false);
  const confirmedRef = useRef(false);
  const confirm = (v: boolean) => { confirmedRef.current = v; };
  const nothing = rows.every((id) => !(emails[id] ?? '').trim());

  return (
    <div className="flex flex-col gap-4">
      <form
        action={formAction}
        onSubmit={(e) => {
          // Zero invites: ask once, then let the second submit through with `confirmEmpty`.
          if (nothing && !confirmedRef.current) {
            e.preventDefault();
            setAsking(true);
          }
        }}
        className="flex flex-col gap-5 rounded-[14px] bg-surface p-6 shadow-card"
      >
        <p className="text-muted-foreground">Add the people who will manage clients with you. You can invite more later from Team.</p>
        <FormError state={state} />
        {rows.map((id, i) => (
          <div key={id} className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`email-${id}`}>Email{rows.length > 1 ? ` ${i + 1}` : ''}</Label>
              <Input id={`email-${id}`} name="email" type="email" className="w-64" value={emails[id] ?? ''} onChange={(e) => { setEmails((m) => ({ ...m, [id]: e.target.value })); setAsking(false); confirm(false); }} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`role-${id}`}>Role{rows.length > 1 ? ` ${i + 1}` : ''}</Label>
              <select id={`role-${id}`} name="role" defaultValue="agency_admin" className={selectClass}>
                <option value="agency_admin">Agency admin</option>
                <option value="account_manager">Account manager</option>
              </select>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" className="self-start" onClick={() => setRows((r) => [...r, Math.max(...r) + 1])}>
          Add another
        </Button>
        {asking && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg bg-muted-surface p-3 text-ink">
            <span>Continue without inviting anyone?</span>
            <Button type="submit" name="confirmEmpty" value="1" onClick={() => confirm(true)}>
              Yes, continue
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAsking(false)}>
              No, add someone
            </Button>
          </div>
        )}
        <WriteGuard>
          <Button type="submit" disabled={pending} className="self-start">
            Done
          </Button>
        </WriteGuard>
      </form>
      <StepNav step="team" />
    </div>
  );
}
