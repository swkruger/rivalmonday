'use client';
import type { Role } from '@cs/core';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Input, Label } from '@cs/ui';
import { useActionState, useState } from 'react';
import type { FormResult } from '@/server/forms';
import { inviteAction, revokeInvitationAction, revokeMembershipAction } from './actions';

const selectClass = 'h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

const ROLE_LABELS: Record<Role, string> = { agency_admin: 'Admin', account_manager: 'Account manager', client_owner: 'Client owner', client_viewer: 'Client viewer' };
const AGENCY_ROLE_OPTIONS: Role[] = ['agency_admin', 'account_manager', 'client_owner', 'client_viewer'];
const CLIENT_ROLE_OPTIONS: Role[] = ['client_owner', 'client_viewer'];

export function InviteForm({ clients, canInviteAgencyRoles }: { clients: { id: string; name: string }[]; canInviteAgencyRoles: boolean }) {
  const [state, formAction, pending] = useActionState(inviteAction, { ok: true } as FormResult);
  const roleOptions = canInviteAgencyRoles ? AGENCY_ROLE_OPTIONS : CLIENT_ROLE_OPTIONS;
  const [role, setRole] = useState<Role>(roleOptions[0]!);
  const isClientRole = role === 'client_owner' || role === 'client_viewer';
  const isAccountManager = role === 'account_manager';

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {!state.ok && state.error && (
        <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">
          {state.error}
        </p>
      )}
      {state.ok && state.message && <p className="rounded-lg bg-muted-surface p-3 text-ink">{state.message}</p>}
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
                {ROLE_LABELS[r]}
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

function ConfirmButton({
  hidden,
  action,
  title,
  description,
  confirmLabel,
  triggerLabel,
}: {
  hidden: Record<string, string>;
  action: (prev: FormResult, fd: FormData) => Promise<FormResult>;
  title: string;
  description: string;
  confirmLabel: string;
  triggerLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: true } as FormResult);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {!state.ok && state.error && (
          <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">
            {state.error}
          </p>
        )}
        <form action={formAction}>
          {Object.entries(hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={pending}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveMemberButton({ membershipId, name }: { membershipId: string; name: string }) {
  return (
    <ConfirmButton
      hidden={{ membershipId }}
      action={revokeMembershipAction}
      title={`Remove ${name}?`}
      description="They lose access to this agency immediately. Any links already sent to them stop working."
      confirmLabel="Remove"
      triggerLabel="Remove"
    />
  );
}

export function RevokeInvitationButton({ invitationId, email }: { invitationId: string; email: string }) {
  return (
    <ConfirmButton
      hidden={{ invitationId }}
      action={revokeInvitationAction}
      title={`Revoke the invitation to ${email}?`}
      description="They will no longer be able to accept it."
      confirmLabel="Revoke"
      triggerLabel="Revoke"
    />
  );
}
