'use client';
import { Button } from '@cs/ui';
import { useActionState } from 'react';
import type { FormResult } from '@/server/forms';
import { assignLeadAction } from './actions';

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

/** The refusal stays in this always-mounted form (a conflict does not revalidate). */
export function AssignForm({ leadId, agencies }: { leadId: string; agencies: AgencyOption[] }) {
  const [state, action, pending] = useActionState(assignLeadAction, { ok: true } as FormResult);
  return (
    <form action={action} onReset={(e) => e.preventDefault()} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="leadId" value={leadId} />
      <select name="agencyId" aria-label="Agency" required defaultValue="" className="h-9 max-w-xs rounded-md border border-input bg-transparent px-3 text-sm shadow-xs">
        <option value="" disabled>Choose an agency</option>
        {agencies.map((a) => (
          <option key={a.id} value={a.id}>{agencyOptionLabel(a)}</option>
        ))}
      </select>
      <Button type="submit" size="sm" disabled={pending}>Assign</Button>
      {!state.ok && <p role="alert" className="basis-full text-sm text-ink">{state.error}</p>}
    </form>
  );
}
