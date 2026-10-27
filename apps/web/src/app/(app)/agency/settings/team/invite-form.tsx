'use client';
import type { Role } from '@cs/core';
import { Band, Button, ConfirmDialog, Input, Label, nativeSelectClass, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import { useActionState, useState, useTransition } from 'react';
import { ErrorNote } from '@/components/form-error';
import { useReadOnly } from '@/components/read-only';
import { labelFor, MEMBERSHIP_ROLE } from '@/lib/labels';
import type { FormResult } from '@/server/forms';
import { inviteAction, resendInvitationAction, revokeInvitationAction, revokeMembershipAction } from './actions';

const selectClass = `${nativeSelectClass} w-full max-w-sm`;

const AGENCY_ROLE_OPTIONS: Role[] = ['agency_admin', 'account_manager', 'client_owner', 'client_viewer'];
const CLIENT_ROLE_OPTIONS: Role[] = ['client_owner', 'client_viewer'];

export function InviteForm({ clients, canInviteAgencyRoles }: { clients: { id: string; name: string }[]; canInviteAgencyRoles: boolean }) {
  const [state, formAction, pending] = useActionState(inviteAction, { ok: true } as FormResult);
  const roleOptions = canInviteAgencyRoles ? AGENCY_ROLE_OPTIONS : CLIENT_ROLE_OPTIONS;
  const [role, setRole] = useState<Role>(roleOptions[0]!);
  const isClientRole = role === 'client_owner' || role === 'client_viewer';
  const isAccountManager = role === 'account_manager';
  const readOnly = useReadOnly();
  if (readOnly) return null;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {!state.ok && state.error && (
        <ErrorNote focusKey={state}>
          {state.error}
        </ErrorNote>
      )}
      {state.ok && state.message && <Band tone="muted" role="status" className="text-ink">{state.message}</Band>}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-email">Email</Label>
          <Input id="invite-email" name="email" type="email" required className="w-64" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-role">Role</Label>
          <select id="invite-role" name="role" className={selectClass} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {labelFor(MEMBERSHIP_ROLE, r).label}
              </option>
            ))}
          </select>
        </div>
        {isClientRole && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-client">Client</Label>
            <select id="invite-client" name="clientId" className={selectClass} required>
              <option value="">Choose a client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <Button type="submit" disabled={pending}>
          Invite
        </Button>
      </div>
      {isAccountManager && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Assigned clients (none ticked = all clients)</legend>
          <div className="flex flex-wrap gap-4">
            {clients.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="scope" value={c.id} className="h-4 w-4 rounded border-input" />
                {c.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </form>
  );
}

type RowResult = { ok: boolean; text: string };

function ResultLine({ result }: { result: RowResult | undefined }) {
  if (!result) return null;
  if (!result.ok) return <ErrorNote compact focusKey={result} className="mt-1">{result.text}</ErrorNote>;
  return <p role="status" className="mt-1 text-sm text-ink">{result.text}</p>;
}

/** Remove behind a ConfirmDialog; a refusal (the last admin) shows beside the button — the row stays, nothing revalidated. */
export function RemoveMemberButton({ membershipId, name }: { membershipId: string; name: string }) {
  const [result, setResult] = useState<RowResult | undefined>();
  if (useReadOnly()) return null;
  return (
    <span className="inline-flex flex-col items-end">
      <ConfirmDialog
        trigger={<Button type="button" variant="outline" size="sm" aria-label={`Remove ${name}`}>Remove</Button>}
        title={`Remove ${name}?`}
        body="They lose access to this agency immediately. Any links already sent to them stop working."
        confirmLabel="Remove"
        tone="danger"
        fields={{ membershipId }}
        action={async (fd) => {
          const r = await revokeMembershipAction({ ok: true }, fd);
          setResult(r.ok ? undefined : { ok: false, text: r.error });
        }}
      />
      <ResultLine result={result} />
    </span>
  );
}

/** One pending invitation, display-ready (the page formats dates in the viewer's zone and resolves labels). */
export interface InvitationRow { id: string; email: string; roleLabel: string; clientLabel: string; dates: string }

function InvitationActions({ row, onResult }: { row: InvitationRow; onResult: (id: string, r: RowResult | undefined) => void }) {
  const [pending, startTransition] = useTransition();
  const resend = () =>
    startTransition(async () => {
      onResult(row.id, undefined);
      const r = await resendInvitationAction({ id: row.id });
      onResult(row.id, r.ok ? { ok: true, text: r.message ?? 'Invite sent again.' } : { ok: false, text: r.error });
    });
  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={resend} aria-label={`Resend invite to ${row.email}`}>Resend</Button>
      <ConfirmDialog
        trigger={<Button type="button" variant="outline" size="sm" aria-label={`Revoke invite to ${row.email}`}>Revoke</Button>}
        title={`Revoke the invitation to ${row.email}?`}
        body="They will no longer be able to accept it."
        confirmLabel="Revoke"
        tone="danger"
        fields={{ invitationId: row.id }}
        action={async (fd) => {
          const r = await revokeInvitationAction({ ok: true }, fd);
          onResult(row.id, r.ok ? undefined : { ok: false, text: r.error });
        }}
      />
    </span>
  );
}

/**
 * Pending invitations. Result lines (resend sent / refused, a refused revoke) live here, keyed by invitation, because this
 * component stays mounted across `revalidatePath` (apps/web/CLAUDE.md, UI patterns); each shows under its own row's email.
 */
export function InvitationTable({ invitations }: { invitations: InvitationRow[] }) {
  const readOnly = useReadOnly();
  const [results, setResults] = useState<Record<string, RowResult | undefined>>({});
  const onResult = (id: string, r: RowResult | undefined) => setResults((prev) => ({ ...prev, [id]: r }));
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Client</TableHead>
          <TableHead>Sent</TableHead>
          {!readOnly && <TableHead><span className="sr-only">Actions</span></TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {invitations.map((i) => (
          <TableRow key={i.id}>
            <TableCell>
              {i.email}
              <ResultLine result={results[i.id]} />
            </TableCell>
            <TableCell>{i.roleLabel}</TableCell>
            <TableCell>{i.clientLabel}</TableCell>
            <TableCell>{i.dates}</TableCell>
            {!readOnly && (
              <TableCell className="text-right">
                <InvitationActions row={i} onResult={onResult} />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
