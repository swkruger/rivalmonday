import { StatusChip, Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from '@cs/ui';
import Link from 'next/link';
import { formatDateTime, formatMoney } from '@/lib/format';
import { SPEND_GUARD_EVENT_KIND, labelFor } from '@/lib/labels';
import { spendScopeLabel } from '@/lib/platform-spend-copy';
import { ResetAiPause } from './reset-ai-pause';

export interface SpendGuardData {
  state: { state: 'ok' | 'warn' | 'paused'; since?: string; scope?: string; observedUsd?: number; baselineUsd?: number };
  scopes: { scope: string; observedUsd: number; baselineUsd: number; ratioPercent: number; floorOnly: boolean }[];
  pausedClients: { clientId: string; clientName: string; agencyId: string; agencyName: string; spendPausedAt: string; spendUsd: number; limitUsd: number }[];
  events: { id: string; kind: string; createdAt: string; scope: string | null; observedUsd: number | null; baselineUsd: number | null; limitUsd: number | null; actor: string; note: string | null }[];
}

const STATE_CHIP = {
  ok: { tone: 'success', label: 'OK' },
  warn: { tone: 'info', label: 'Warning' },
  paused: { tone: 'neutral', label: 'Paused' },
} as const;

const money = (n: number | null) => (n === null ? '—' : formatMoney(n, { cents: true }));

/**
 * Spend guard card on /platform/health (7b1 d13): state, per-scope spike readings, spend-paused clients and the last
 * events. Platform surfaces may show dollars. `canReset` = staff or owner; viewers get no Reset button.
 */
export function SpendGuardPanel({ data, canReset, tz = 'UTC' }: { data: SpendGuardData; canReset: boolean; tz?: string }) {
  const when = (iso: string) => formatDateTime(iso, { tz, zoneLabel: true });
  const chip = STATE_CHIP[data.state.state];
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
        {data.state.state !== 'ok' && (
          <span className="text-sm text-muted-ink">
            {data.state.scope ? `${spendScopeLabel(data.state.scope)}` : ''}
            {data.state.since ? ` · since ${when(data.state.since)}` : ''}
          </span>
        )}
        {canReset && <ResetAiPause active={data.state.state !== 'ok'} />}
      </div>

      <TableFrame>
        <Table>
          <caption className="sr-only">Spike readings by scope</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Scope</TableHead>
              <TableHead numeric>Observed</TableHead>
              <TableHead numeric>Baseline</TableHead>
              <TableHead numeric>Above normal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.scopes.map((s) => (
              <TableRow key={s.scope}>
                <TableCell className="font-medium">{spendScopeLabel(s.scope)}</TableCell>
                <TableCell numeric>{money(s.observedUsd)}</TableCell>
                <TableCell numeric>{money(s.baselineUsd)}</TableCell>
                <TableCell numeric>
                  {s.ratioPercent}%
                  {s.floorOnly && <StatusChip tone="neutral" className="ml-2" title="Below the spend floor, so it cannot trigger the guard">floor</StatusChip>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Paused clients</h3>
        {data.pausedClients.length === 0 ? (
          <p className="text-sm text-muted-ink">No client is paused for spend.</p>
        ) : (
          <TableFrame>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Agency</TableHead>
                  <TableHead numeric>Spend</TableHead>
                  <TableHead numeric>Limit</TableHead>
                  <TableHead>Since</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.pausedClients.map((c) => (
                  <TableRow key={c.clientId}>
                    <TableCell className="font-medium">{c.clientName}</TableCell>
                    <TableCell>
                      <Link href={`/platform/agencies/${c.agencyId}`} className="underline">{c.agencyName}</Link>
                    </TableCell>
                    <TableCell numeric>{money(c.spendUsd)}</TableCell>
                    <TableCell numeric>{money(c.limitUsd)}</TableCell>
                    <TableCell>{when(c.spendPausedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Recent events</h3>
        {data.events.length === 0 ? (
          <p className="text-sm text-muted-ink">No guard events yet.</p>
        ) : (
          <TableFrame>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead numeric>Observed / baseline</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.events.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{when(e.createdAt)}</TableCell>
                    <TableCell>{labelFor(SPEND_GUARD_EVENT_KIND, e.kind).label}</TableCell>
                    <TableCell>{e.scope ? spendScopeLabel(e.scope) : '—'}</TableCell>
                    <TableCell numeric>{e.observedUsd === null ? '—' : `${money(e.observedUsd)} / ${money(e.baselineUsd)}`}</TableCell>
                    <TableCell>{e.actor}</TableCell>
                    <TableCell>{e.note ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        )}
      </div>
    </div>
  );
}
