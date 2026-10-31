'use client';
import { Field, Input } from '@cs/ui';
import { useState } from 'react';
import { ErrorNote } from '@/components/form-error';
import { INPUT_CLASS } from '@/components/onboarding/input-class';
import { OnboardingShell } from '@/components/onboarding/onboarding-shell';
import { PreviewWindow } from '@/components/onboarding/preview-window';
import { OwnerInviteEmail } from '@/components/onboarding/previews/owner-invite-email';
import { StepFooter } from '@/components/onboarding/step-footer';
import { useReadOnly } from '@/components/read-only';
import type { ClientSetupView } from '../types';
import { type StepFrame, stepOf } from './frame';

const firstNameOf = (full: string | null) => full?.trim().split(/\s+/)[0] ?? '';
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

/** Name + email status under the heading; null before anyone is invited. */
function InviteStatus({ invite }: { invite: ClientSetupView['invite'] }) {
  if (invite.status === 'pending') return <p role="status" className="text-sm text-muted-ink">Invited {invite.email}. Waiting for them to accept.</p>;
  if (invite.status === 'accepted') return <p role="status" className="text-sm text-muted-ink">{invite.name ?? invite.email} accepted.</p>;
  return null;
}

/**
 * Step 5 (spec 16 §6, staff): "Send Maria an invite", pre-filled from the step 1 contact, with "Invite someone else
 * instead". While the owner was asked to pick competitors there is no Skip (P12): the invitation is what emails them.
 */
export function InviteStep({ frame, clientName, agencyName, contact, invite, rivals, waitingOwner, backHref, pending, error, onSend, onSkip }: {
  frame: StepFrame; clientName: string; agencyName: string;
  /** The step 1 contact (the client's owner contact), if there is one. */
  contact: { name: string | null; email: string | null } | null;
  invite: ClientSetupView['invite']; rivals: string[]; waitingOwner: boolean; backHref: string; pending: boolean; error: string | null;
  onSend: (name: string, email: string) => void; onSkip: () => void;
}) {
  const readOnly = useReadOnly();
  const known = Boolean(contact?.name && contact.email);
  const [other, setOther] = useState(!known);
  const [name, setName] = useState(other ? (invite.name ?? '') : '');
  const [email, setEmail] = useState(other ? (invite.email ?? '') : '');
  const [focusEmail, setFocusEmail] = useState(false);
  const target = other ? { name: name.trim(), email: email.trim() } : { name: contact?.name ?? '', email: contact?.email ?? '' };
  const sent = invite.status !== 'none';
  const first = firstNameOf(target.name);
  const ready = Boolean(target.name && target.email);

  return (
    <OnboardingShell
      brand={frame.brand}
      exitSlot={frame.exitSlot}
      step={stepOf(frame, 'invite')}
      title="Invite the owner"
      subtitle="They get their own sign-in to see the dashboard and every Monday brief."
      helpKey="page:client.setup"
      guide={frame.guide}
      preview={<PreviewWindow chrome="Email"><OwnerInviteEmail agency={agencyName} to={target.email} firstName={first} client={clientName} rivals={rivals} focus={focusEmail} /></PreviewWindow>}
      caption={<><b className="font-semibold">Preview.</b> The invite email {first || 'the owner'} receives, in your brand.</>}
      footer={
        <StepFooter
          back={backHref}
          skip={waitingOwner ? undefined : { label: 'Skip for now', onSkip, disabled: readOnly || pending }}
          primary={{ label: sent ? 'Send again' : 'Send invite', pending, disabled: readOnly || !ready, form: 'invite-form' }}
        />
      }
    >
      {error && <ErrorNote focusKey={error}>{error}</ErrorNote>}
      <InviteStatus invite={invite} />
      {waitingOwner && <p className="rounded-md bg-muted-surface p-3 text-sm">You asked the owner to pick the competitors. The invite is what emails them, so it can&apos;t be skipped.</p>}
      <form id="invite-form" onSubmit={(e) => { e.preventDefault(); if (ready) onSend(target.name, target.email); }} onReset={(e) => e.preventDefault()} className="flex flex-col gap-4">
        <fieldset disabled={readOnly} className="contents">
          {!other && contact ? (
            <>
              <p className="text-sm font-medium">Send {first} an invite</p>
              <div className="flex min-w-0 items-center gap-3 rounded-md border border-line px-3.5 py-3">
                <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-13 font-semibold text-primary-soft-text">{initialsOf(contact.name ?? '')}</span>
                <span className="min-w-0 text-sm"><b className="font-semibold">{contact.name}</b><span className="block truncate text-13 text-muted-ink">{contact.email} · from client details</span></span>
              </div>
              <button type="button" onClick={() => setOther(true)} className="self-start text-sm font-medium text-secondary">Invite someone else instead</button>
            </>
          ) : (
            <>
              <Field label="Owner's name" required>
                <Input id="invite-name" autoComplete="off" required aria-required value={name} onChange={(e) => setName(e.target.value)} className={INPUT_CLASS} maxLength={120} />
              </Field>
              <Field label="Owner's email" required>
                <Input id="invite-email" type="email" autoComplete="off" required aria-required value={email} onChange={(e) => setEmail(e.target.value)} onFocus={() => setFocusEmail(true)} onBlur={() => setFocusEmail(false)} className={INPUT_CLASS} />
              </Field>
              {known && <button type="button" onClick={() => setOther(false)} className="self-start text-sm font-medium text-secondary">Use {firstNameOf(contact!.name)} instead</button>}
            </>
          )}
        </fieldset>
      </form>
    </OnboardingShell>
  );
}
