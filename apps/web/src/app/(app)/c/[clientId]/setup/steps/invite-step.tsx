'use client';
import { Button, Input, Label } from '@cs/ui';
import { useState } from 'react';
import { WriteGuard } from '@/components/read-only';
import type { ClientSetupView } from '../types';

/**
 * Name + email, controlled (React 19 resets an uncontrolled `<form action>` after every action, errors included).
 * Shared by the Invite step and the "Invite the owner" side panel on steps 1-3.
 */
export function InviteForm({ invite, pending, onInvite }: { invite: ClientSetupView['invite']; pending: boolean; onInvite: (name: string, email: string) => void }) {
  const [name, setName] = useState(invite.name ?? '');
  const [email, setEmail] = useState(invite.email ?? '');
  const sent = invite.status !== 'none';
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onInvite(name.trim(), email.trim()); }}
      onReset={(e) => e.preventDefault()}
      className="flex flex-col gap-3"
    >
      <div className="flex max-w-md flex-col gap-2">
        <Label htmlFor="invite-name">Owner's name</Label>
        <Input id="invite-name" autoComplete="off" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex max-w-md flex-col gap-2">
        <Label htmlFor="invite-email">Owner's email</Label>
        <Input id="invite-email" type="email" autoComplete="off" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <WriteGuard>
        <div>
          <Button type="submit" disabled={pending || !name.trim() || !email.trim()}>{sent ? 'Send again' : 'Send invite'}</Button>
        </div>
      </WriteGuard>
    </form>
  );
}

/** Calm status line under the heading; null before anyone is invited. */
export function InviteStatus({ invite }: { invite: ClientSetupView['invite'] }) {
  if (invite.status === 'pending') return <p className="text-muted-foreground">Invited {invite.email} — waiting for them to accept</p>;
  if (invite.status === 'accepted') return <p className="text-muted-foreground">{invite.name ?? invite.email} accepted</p>;
  return null;
}

/** Step 4 (staff only). */
export function InviteStep({ invite, pending, onInvite, onSkip }: { invite: ClientSetupView['invite']; pending: boolean; onInvite: (name: string, email: string) => void; onSkip: () => void }) {
  return (
    <section className="flex flex-col gap-4 rounded-[14px] bg-surface p-6 shadow-card">
      <h2 className="font-semibold">Invite the owner</h2>
      <InviteStatus invite={invite} />
      <InviteForm invite={invite} pending={pending} onInvite={onInvite} />
      <WriteGuard>
        <div>
          <Button type="button" variant="outline" disabled={pending} onClick={onSkip}>Skip for now</Button>
        </div>
      </WriteGuard>
    </section>
  );
}
