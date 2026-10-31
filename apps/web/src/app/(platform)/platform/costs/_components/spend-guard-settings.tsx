'use client';
import { SaveBar } from '@cs/ui';
import { useActionState, useState } from 'react';
import { ErrorNote } from '@/components/form-error';
import { WriteGuard } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import { updateSpendGuardSettingsAction } from '../actions';
import { Field, fieldCls } from '../../_components/mini-form';

export interface GuardSettings {
  creditsPerUsd: number;
  clientMonthlyLimitUsd: number;
  clientPausePercent: number;
  spikeWarnPercent: number;
  spikePausePercent: number;
  spikeFloorUsdPerDay: number;
  spikeFloorUsdPerClientDay: number;
  spikeSnoozeHours: number;
}

const FIELDS: { key: keyof GuardSettings; label: string; step: string }[] = [
  { key: 'creditsPerUsd', label: 'Credits per $1', step: '1' },
  { key: 'clientMonthlyLimitUsd', label: 'Default client limit (USD per month)', step: '0.01' },
  { key: 'clientPausePercent', label: 'Pause a client at (% of its limit)', step: '1' },
  { key: 'spikeWarnPercent', label: 'Warn when spend is above normal by (%)', step: '1' },
  { key: 'spikePausePercent', label: 'Pause all AI when above normal by (%)', step: '1' },
  { key: 'spikeFloorUsdPerDay', label: 'Spike floor, whole platform (USD per day)', step: '0.01' },
  { key: 'spikeFloorUsdPerClientDay', label: 'Spike floor, per client (USD per day)', step: '0.01' },
  { key: 'spikeSnoozeHours', label: 'Snooze after a reset (hours)', step: '1' },
];

/** Owner-only card on /platform/costs: the eight guard settings. Only the fields that differ from the stored value are sent. */
export function SpendGuardSettings({ settings }: { settings: GuardSettings }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(FIELDS.map((f) => [f.key, String(settings[f.key])])));
  const [state, formAction, pending] = useActionState(updateSpendGuardSettingsAction, { ok: true } as FormResult);
  const changed = FIELDS.filter((f) => values[f.key]!.trim() !== '' && Number(values[f.key]) !== settings[f.key]);
  const blank = FIELDS.some((f) => values[f.key]!.trim() === '');
  const reset = () => setValues(Object.fromEntries(FIELDS.map((f) => [f.key, String(settings[f.key])])));
  const submit = (fd: FormData) => {
    const only = new FormData();
    for (const f of changed) only.set(f.key, String(fd.get(f.key) ?? ''));
    formAction(only);
  };
  return (
    <form action={submit} onReset={(e) => e.preventDefault()} className="flex flex-col gap-4">
      <p className="text-sm text-muted-ink">{`${settings.creditsPerUsd} credits = $1`}</p>
      <div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FIELDS.map((f) => (
          <Field key={f.key} label={f.label} htmlFor={`sg-${f.key}`}>
            <input
              id={`sg-${f.key}`}
              name={f.key}
              type="number"
              inputMode="decimal"
              step={f.step}
              min="0"
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className={fieldCls}
            />
          </Field>
        ))}
      </div>
      {!state.ok && <ErrorNote compact focusKey={state}>{state.error}</ErrorNote>}
      {state.ok && state.message && <p role="status" className="text-sm text-ink">{state.message}</p>}
      <WriteGuard>
        <SaveBar dirty={changed.length > 0 && !blank} pending={pending} onReset={reset} />
      </WriteGuard>
    </form>
  );
}
