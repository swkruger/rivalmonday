'use client';
import { Input } from '@cs/ui';
import { X } from 'lucide-react';
import { useActionState, useState } from 'react';
import { FormError } from '@/components/form-error';
import { Field, INPUT_CLASS, SELECT_CLASS } from '@/components/onboarding/field';
import { OnboardingShell } from '@/components/onboarding/onboarding-shell';
import { PreviewWindow } from '@/components/onboarding/preview-window';
import { InviteEmail, type InviteFocus } from '@/components/onboarding/previews/invite-email';
import { StepFooter } from '@/components/onboarding/step-footer';
import { useReadOnly } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import { inviteTeamAction } from '../actions';
import { prevPath, STEP_LABELS, STEPS } from '../flow';
import { useSkip } from './use-skip';

const ROLE_PHRASE: Record<string, string> = { agency_admin: 'an agency admin', account_manager: 'an account manager' };

interface Row { id: number; email: string; role: string }

/** Step 2 (spec 16 §5): rows of email and role, a count in the primary label, the invite email as the preview. */
export function TeamStep({ agencyName, inviterName, guide }: { agencyName: string; inviterName: string; guide: boolean }) {
  const [state, formAction, pending] = useActionState(inviteTeamAction, { ok: true } as FormResult);
  const readOnly = useReadOnly();
  const { skip, skipping } = useSkip('team');
  // Controlled: React 19 resets uncontrolled fields after a form action, errors included (a role must never snap back to its default).
  const [rows, setRows] = useState<Row[]>([{ id: 0, email: '', role: 'account_manager' }]);
  const [focus, setFocus] = useState<{ id: number; part: InviteFocus } | null>(null);
  const patch = (id: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const filled = rows.filter((r) => r.email.trim());
  const n = filled.length;
  const shown = (focus && rows.find((r) => r.id === focus.id)) || filled[0] || rows[0]!;

  return (
    <OnboardingShell
      brand={{ kind: 'platform' }}
      step={{ n: 2, of: STEPS.length, label: STEP_LABELS.team }}
      exit={{ href: '/agency', label: 'Save and exit' }}
      title="Invite your team"
      subtitle={`Teammates get an email from ${agencyName}. You can add people later too.`}
      helpKey="page:account.onboarding"
      guide={guide}
      preview={
        <PreviewWindow chrome={false} width={520}>
          <InviteEmail agency={agencyName} inviter={inviterName} to={shown.email.trim()} role={ROLE_PHRASE[shown.role] ?? 'a teammate'} focus={focus && focus.id === shown.id ? focus.part : null} />
        </PreviewWindow>
      }
      caption={<><b className="font-semibold">Preview.</b> The invite email your team receives.</>}
      footer={
        <StepFooter
          back={prevPath('team')!}
          skip={{ label: 'Skip for now', onSkip: () => { if (!readOnly && !skipping) skip(); } }}
          primary={{ label: n >= 1 ? `Send ${n} invite${n === 1 ? '' : 's'}` : 'Continue', pending, disabled: readOnly, form: 'team-form' }}
        />
      }
    >
      <form id="team-form" action={formAction} onReset={(e) => e.preventDefault()} className="flex flex-col gap-4">
        <FormError state={state} />
        <fieldset disabled={readOnly} className="contents">
          <div className="flex flex-col gap-2.5">
            <p className="text-[13px] font-medium">Invite people <span className="font-normal text-muted-ink">(optional)</span></p>
            {rows.map((r, i) => (
              <div key={r.id} className="grid grid-cols-[1fr_170px_20px] items-end gap-2.5">
                <Field id={`email-${r.id}`} label={`Email${rows.length > 1 ? ` ${i + 1}` : ''}`}>
                  <Input id={`email-${r.id}`} name="email" type="email" placeholder="name@agency.com" className={INPUT_CLASS} value={r.email}
                    onChange={(e) => patch(r.id, { email: e.target.value })} onFocus={() => setFocus({ id: r.id, part: 'to' })} onBlur={() => setFocus(null)} />
                </Field>
                <Field id={`role-${r.id}`} label={`Role${rows.length > 1 ? ` ${i + 1}` : ''}`}>
                  <select id={`role-${r.id}`} name="role" value={r.role} className={SELECT_CLASS}
                    onChange={(e) => patch(r.id, { role: e.target.value })} onFocus={() => setFocus({ id: r.id, part: 'role' })} onBlur={() => setFocus(null)}>
                    <option value="agency_admin">Agency admin</option>
                    <option value="account_manager">Account manager</option>
                  </select>
                </Field>
                {rows.length > 1 ? (
                  <button type="button" aria-label={`Remove invite ${i + 1}`} onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))} className="mb-2.5 text-muted-ink hover:text-ink">
                    <X aria-hidden="true" className="size-4" />
                  </button>
                ) : <span />}
              </div>
            ))}
            <button type="button" onClick={() => setRows((rs) => [...rs, { id: Math.max(...rs.map((x) => x.id)) + 1, email: '', role: 'account_manager' }])} className="self-start text-sm font-medium text-secondary">
              + Add another
            </button>
            <p className="text-[13px] text-muted-ink">Admins manage billing and team. Account managers run clients.</p>
          </div>
        </fieldset>
      </form>
    </OnboardingShell>
  );
}
