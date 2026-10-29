'use client';
import { Switch } from '@cs/ui';
import { useOptimistic, useState, useTransition } from 'react';
import { ErrorNote } from '@/components/form-error';
import { WriteGuard } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import { Field, fieldCls, MiniForm } from '../_components/mini-form';
import { setPilotModeAction, setSampleLimitAction } from './actions';

export const PILOT_LABEL = 'Pilot mode';
export const PILOT_HINT = 'On: open agency sign-up is closed and the site shows the waitlist. Invite links keep working.';
export const SAMPLE_LABEL = 'Sample briefs per month';
export const SAMPLE_HINT = 'Approvals beyond this number are refused until next month.';

function PilotSwitch({ on }: { on: boolean }) {
  const [checked, setChecked] = useOptimistic(on);
  const [result, setResult] = useState<FormResult>({ ok: true });
  const [isPending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Switch
          checked={checked}
          disabled={isPending}
          aria-label={PILOT_LABEL}
          onCheckedChange={(next: boolean) => {
            if (isPending) return;
            startTransition(async () => {
              setChecked(next);
              setResult(await setPilotModeAction(next));
            });
          }}
        />
        <span className="text-sm font-medium text-ink">{PILOT_LABEL}</span>
      </div>
      {!result.ok && <ErrorNote compact>{result.error}</ErrorNote>}
    </div>
  );
}

/** Pilot switch and the monthly sample-brief limit. Owners edit; everyone else (and read-only sessions) reads the values. */
export function PilotPanel({ pilotOn, sampleLimit, canEdit }: { pilotOn: boolean; sampleLimit: number; canEdit: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        {canEdit ? (
          <WriteGuard>
            <PilotSwitch on={pilotOn} />
          </WriteGuard>
        ) : (
          <p className="text-sm text-ink" role="status">
            {PILOT_LABEL} is <strong>{pilotOn ? 'on' : 'off'}</strong>.
          </p>
        )}
        <p className="text-sm text-muted-ink">{PILOT_HINT}</p>
      </div>
      <div className="flex flex-col gap-2">
        {canEdit ? (
          <WriteGuard>
            <MiniForm action={setSampleLimitAction} submit="Save">
              <Field label={SAMPLE_LABEL} htmlFor="sample-limit">
                <input id="sample-limit" name="n" type="number" inputMode="numeric" min={0} max={100} step={1} defaultValue={sampleLimit} required className={`${fieldCls} w-28`} />
              </Field>
            </MiniForm>
          </WriteGuard>
        ) : (
          <p className="text-sm text-ink">
            {SAMPLE_LABEL}: <strong>{sampleLimit}</strong>
          </p>
        )}
        <p className="text-sm text-muted-ink">{SAMPLE_HINT}</p>
      </div>
    </div>
  );
}
