'use client';
import { Band, Button, nativeSelectClass } from '@cs/ui';
import { createContext, useActionState, useContext } from 'react';
import type { FormResult } from '@/server/forms';
import { assignLeadAction } from './actions';
import { ErrorNote } from '@/components/form-error';

export interface AgencyOption {
  id: string;
  name: string;
  verticals: string[];
  activeClients: number;
}

/** "Name — dental, hvac · 4 active clients": the picker shows what each agency already serves. */
export function agencyOptionLabel(a: AgencyOption): string {
  const v = a.verticals.length ? a.verticals.join(', ') : 'no clients yet';
  return `${a.name} — ${v} · ${a.activeClients} active ${a.activeClients === 1 ? 'client' : 'clients'}`;
}

type Assign = (fd: FormData) => void;
const AssignContext = createContext<{ action: Assign; pending: boolean } | null>(null);

/**
 * One action state for every row's Assign, held here (not per row): an assigned lead leaves the list on revalidate, so a
 * per-row result would unmount with it. The result line sits above the table, always mounted (precedent `ReviewQueue`).
 */
export function AssignScope({ children }: { children: React.ReactNode }) {
  const [state, action, pending] = useActionState(assignLeadAction, { ok: true } as FormResult);
  return (
    <AssignContext.Provider value={{ action, pending }}>
      <div className="flex flex-col gap-4">
        {!state.ok && <ErrorNote focusKey={state}>{state.error}</ErrorNote>}
        {state.ok && state.message && <Band tone="muted" role="status" className="p-3 text-ink">{state.message}</Band>}
        {children}
      </div>
    </AssignContext.Provider>
  );
}

export function AssignForm({ leadId, leadName, agencies }: { leadId: string; leadName: string; agencies: AgencyOption[] }) {
  const scope = useContext(AssignContext);
  if (!scope) throw new Error('AssignForm must sit inside AssignScope');
  return (
    <form action={scope.action} onReset={(e) => e.preventDefault()} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="leadId" value={leadId} />
      <select name="agencyId" aria-label={`Agency for ${leadName}`} required defaultValue="" className={`${nativeSelectClass} max-w-xs`}>
        <option value="" disabled>Choose an agency</option>
        {agencies.map((a) => (
          <option key={a.id} value={a.id}>{agencyOptionLabel(a)}</option>
        ))}
      </select>
      <Button type="submit" size="sm" disabled={scope.pending}>Assign</Button>
    </form>
  );
}
