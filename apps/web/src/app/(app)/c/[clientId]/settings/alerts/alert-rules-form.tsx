'use client';
import { Button, Input, Label, SaveBar } from '@cs/ui';
import { useActionState, useRef, useState } from 'react';
import { ErrorNote } from '@/components/form-error';
import { HelpText, useHelp } from '@/components/help/help-context';
import { useReadOnly } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import { BandBar } from './band-bar';

export interface AlertRulesProps {
  alert: number;
  brief: number;
  custom: boolean;
  defaults: { alert: number; brief: number };
}

/** The typed pair when it is one the server would accept (whole numbers, brief 1-99, alert up to 100, brief below alert). */
function validPair(brief: string, alert: string): { brief: number; alert: number } | null {
  const b = Number(brief);
  const a = Number(alert);
  if (brief.trim() === '' || alert.trim() === '' || !Number.isInteger(b) || !Number.isInteger(a)) return null;
  return b >= 1 && a <= 100 && b < a ? { brief: b, alert: a } : null;
}

export function AlertRulesForm({ clientId, rules, canEdit: canEditProp, action }: {
  clientId: string;
  rules: AlertRulesProps;
  canEdit: boolean;
  action: (prev: FormResult, fd: FormData) => Promise<FormResult>;
}) {
  const readOnly = useReadOnly();
  const { audience } = useHelp();
  const canEdit = canEditProp && !readOnly;
  const [brief, setBrief] = useState(String(rules.brief));
  const [alert, setAlert] = useState(String(rules.alert));
  const [dirty, setDirty] = useState(false);
  const lastValid = useRef({ brief: rules.brief, alert: rules.alert });
  const typed = validPair(brief, alert);
  if (typed) lastValid.current = typed;
  const [state, formAction, pending] = useActionState(async (prev: FormResult, fd: FormData) => {
    const r = await action(prev, fd);
    if (r.ok) {
      setDirty(false);
      if (fd.get('intent') === 'reset') {
        setBrief(String(rules.defaults.brief));
        setAlert(String(rules.defaults.alert));
      }
    }
    return r;
  }, { ok: true } as FormResult);

  if (!canEdit) {
    return (
      <div className="flex flex-col gap-4 rounded-[14px] bg-surface p-6 shadow-card">
        <BandBar brief={rules.brief} alert={rules.alert} />
        <p>
          {/* "Ask {agency}…" speaks to the client; agency staff without edit rights (and support sessions) get the facts only. */}
          Instant alert from score {rules.alert}; weekly brief from score {rules.brief}.{!readOnly && audience === 'client' ? <HelpText text=" Ask {agency} to change these." /> : ''}
        </p>
      </div>
    );
  }
  return (
    <>
      <form
        action={formAction}
        // React 19 resets a form after every action, errors included; both fields are controlled, so keep what was typed.
        onReset={(e) => e.preventDefault()}
        onChange={() => setDirty(true)}
        className="flex flex-col gap-4 rounded-[14px] bg-surface p-6 shadow-card"
      >
        <input type="hidden" name="clientId" value={clientId} />
        <BandBar brief={lastValid.current.brief} alert={lastValid.current.alert} />
        <div className="flex flex-wrap gap-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="brief">Weekly brief from score</Label>
            <Input id="brief" name="brief" type="number" min={1} max={99} step={1} value={brief} onChange={(e) => setBrief(e.target.value)} className="w-32" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="alert">Instant alert from score</Label>
            <Input id="alert" name="alert" type="number" min={2} max={100} step={1} value={alert} onChange={(e) => setAlert(e.target.value)} className="w-32" />
          </div>
        </div>
        {!state.ok && state.error && <ErrorNote focusKey={state}>{state.error}</ErrorNote>}
        {state.ok && !dirty && state.message && <p role="status" className="text-ink">{state.message}</p>}
        <SaveBar
          dirty={dirty}
          pending={pending}
          saveLabel="Save"
          onReset={() => {
            setBrief(String(rules.brief));
            setAlert(String(rules.alert));
            setDirty(false);
          }}
        />
      </form>
      {rules.custom && (
        // A separate form: a second submit button inside the main one would take Enter in a number box.
        <form action={formAction}>
          <input type="hidden" name="clientId" value={clientId} />
          <Button type="submit" name="intent" value="reset" variant="outline" disabled={pending}>
            Use the defaults ({rules.defaults.alert}/{rules.defaults.brief})
          </Button>
        </form>
      )}
    </>
  );
}
