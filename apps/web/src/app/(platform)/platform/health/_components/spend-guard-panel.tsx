import { StatusChip } from '@cs/ui';
import Link from 'next/link';
import { formatDateTime, formatMoney } from '@/lib/format';
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

const th = 'px-3 py-2 font-semibold';
const td = 'px-3 py-2';
const money = (n: number | null) => (n === null ? '—' : formatMoney(n, { cents: true }));
const when = (iso: string) => formatDateTime(iso, { tz: 'UTC', zoneLabel: true });

/**
 * Spend guard card on /platform/health (7b1 d13): state, per-scope spike readings, spend-paused clients and the last
 * events. Platform surfaces may show dollars. `canReset` = staff or owner; viewers get no Reset button.
 */
export function SpendGuardPanel({ data, canReset }: { data: SpendGuardData; canReset: boolean }) {
  const chip = STATE_CHIP[data.state.state];
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
        {data.state.state !== 'ok' && (
          <span className="text-sm text-muted-foreground">
            {data.state.scope ? `${spendScopeLabel(data.state.scope)}` : ''}
            {data.state.since ? ` · since ${when(data.state.since)}` : ''}
          </span>
        )}
        {canReset && <ResetAiPause active={data.state.state !== 'ok'} />}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-sm">
          <caption className="sr-only">Spike readings by scope</caption>
          <thead>
            <tr className="text-muted-foreground">
              <th scope="col" className={th}>Scope</th>
              <th scope="col" className={`${th} text-right`}>Observed</th>
              <th scope="col" className={`${th} text-right`}>Baseline</th>
              <th scope="col" className={`${th} text-right`}>Above normal</th>
            </tr>
          </thead>
          <tbody>
            {data.scopes.map((s) => (
              <tr key={s.scope} className="border-t border-[#EEF2F6]">
                <td className={`${td} font-semibold`}>{spendScopeLabel(s.scope)}</td>
                <td className={`${td} text-right`}>{money(s.observedUsd)}</td>
                <td className={`${td} text-right`}>{money(s.baselineUsd)}</td>
                <td className={`${td} text-right`}>
                  {s.ratioPercent}%
                  {s.floorOnly && <span className="ml-2 rounded-full bg-muted-surface px-2 py-0.5 text-xs font-semibold text-ink" title="Below the spend floor, so it cannot trigger the guard">floor</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Paused clients</h3>
        {data.pausedClients.length === 0 ? (
          <p className="text-sm text-muted-foreground">No client is paused for spend.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="text-muted-foreground">
                  <th scope="col" className={th}>Client</th>
                  <th scope="col" className={th}>Agency</th>
                  <th scope="col" className={`${th} text-right`}>Spend</th>
                  <th scope="col" className={`${th} text-right`}>Limit</th>
                  <th scope="col" className={th}>Since</th>
                </tr>
              </thead>
              <tbody>
                {data.pausedClients.map((c) => (
                  <tr key={c.clientId} className="border-t border-[#EEF2F6]">
                    <td className={`${td} font-semibold`}>{c.clientName}</td>
                    <td className={td}>
                      <Link href={`/platform/agencies/${c.agencyId}`} className="underline">{c.agencyName}</Link>
                    </td>
                    <td className={`${td} text-right`}>{money(c.spendUsd)}</td>
                    <td className={`${td} text-right`}>{money(c.limitUsd)}</td>
                    <td className={`${td} whitespace-nowrap`}>{when(c.spendPausedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Recent events</h3>
        {data.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No guard events yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="text-muted-foreground">
                  <th scope="col" className={th}>When</th>
                  <th scope="col" className={th}>Event</th>
                  <th scope="col" className={th}>Scope</th>
                  <th scope="col" className={`${th} text-right`}>Observed / baseline</th>
                  <th scope="col" className={th}>By</th>
                  <th scope="col" className={th}>Note</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((e) => (
                  <tr key={e.id} className="border-t border-[#EEF2F6]">
                    <td className={`${td} whitespace-nowrap`}>{when(e.createdAt)}</td>
                    <td className={td}>{e.kind}</td>
                    <td className={td}>{e.scope ? spendScopeLabel(e.scope) : '—'}</td>
                    <td className={`${td} text-right`}>{e.observedUsd === null ? '—' : `${money(e.observedUsd)} / ${money(e.baselineUsd)}`}</td>
                    <td className={td}>{e.actor}</td>
                    <td className={td}>{e.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
