'use client';
import { Button, ConfirmDialog, StatusChip, Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from '@cs/ui';
import { useState } from 'react';
import { ErrorNote } from '@/components/form-error';
import { AGENCY_LIFECYCLE, BILLING_STATE, labelFor } from '@/lib/labels';
import { moveAgenciesToCurrentPlanAction } from './actions';
import { monthly, MoveLines, moveSummary, type PlanAgencyRow, versionText } from '../_components/plan-move-parts';

export interface PlanAgenciesData {
  currentVersion: number;
  agencies: PlanAgencyRow[];
}

type Outcome = { ok: true; message: string } | { ok: false; error: string };

/**
 * Agencies not on the current plan version (15c-3b spec §3.6). Owners tick rows and move them; everyone else sees the table
 * read-only. Held and cancelled rows are disabled (the tool refuses both). The result line lives here (always mounted), so it survives the list refreshing.
 */
export function PlanAgencies({ data, canMove }: { data: PlanAgenciesData; canMove: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const rows = data.agencies;
  const locked = (r: PlanAgencyRow) => r.onHold || r.state === 'cancelled';
  const enabled = rows.filter((r) => !locked(r));
  const chosen = rows.filter((r) => selected.has(r.agencyId) && !locked(r));
  const allChecked = enabled.length > 0 && enabled.every((r) => selected.has(r.agencyId));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const move = async () => {
    const ids = chosen.map((r) => r.agencyId);
    const names = new Map(rows.map((r) => [r.agencyId, r.name]));
    const r = await moveAgenciesToCurrentPlanAction(ids);
    if (!r.ok) {
      setOutcome({ ok: false, error: r.error });
      return;
    }
    setOutcome({ ok: true, message: moveSummary(r.data, (id) => names.get(id) ?? 'Unknown agency') });
    setSelected(new Set());
  };

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-ink">Every agency is on the current version.</p>
      ) : (
        <TableFrame>
          <Table>
            <TableHeader>
              <TableRow>
                {canMove && (
                  <TableHead className="w-8">
                    <input
                      type="checkbox"
                      aria-label="Select all agencies"
                      className="h-4 w-4 rounded-sm border-input"
                      checked={allChecked}
                      disabled={enabled.length === 0}
                      onChange={() => setSelected(allChecked ? new Set() : new Set(enabled.map((r) => r.agencyId)))}
                    />
                  </TableHead>
                )}
                {['Agency', 'Version', 'State', 'Monthly now → after'].map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const state = labelFor(BILLING_STATE, r.state);
                return (
                  <TableRow key={r.agencyId}>
                    {canMove && (
                      <TableCell>
                        <input
                          type="checkbox"
                          aria-label={`Select ${r.name}`}
                          className="h-4 w-4 rounded-sm border-input"
                          checked={selected.has(r.agencyId) && !locked(r)}
                          disabled={locked(r)}
                          onChange={() => toggle(r.agencyId)}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{versionText(r.version)}</TableCell>
                    <TableCell>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <StatusChip tone={state.tone}>{state.label}</StatusChip>
                        {r.onHold && <StatusChip tone={AGENCY_LIFECYCLE.on_hold.tone}>{AGENCY_LIFECYCLE.on_hold.label}</StatusChip>}
                      </span>
                    </TableCell>
                    <TableCell>{monthly(r.monthlyNowCents)} → {monthly(r.monthlyAfterCents)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableFrame>
      )}
      {canMove && rows.length > 0 && (
        <div>
          <ConfirmDialog
            trigger={<Button type="button" disabled={chosen.length === 0}>Move selected to v{data.currentVersion}</Button>}
            title={`Move ${chosen.length} ${chosen.length === 1 ? 'agency' : 'agencies'} to v${data.currentVersion}?`}
            body={<MoveLines rows={chosen} targetVersion={data.currentVersion} />}
            confirmLabel={`Move to v${data.currentVersion}`}
            action={move}
          />
        </div>
      )}
      {outcome?.ok === true && <p role="status" className="text-sm text-ink">{outcome.message}</p>}
      {outcome?.ok === false && <ErrorNote compact focusKey={outcome.error}>{outcome.error}</ErrorNote>}
    </div>
  );
}
