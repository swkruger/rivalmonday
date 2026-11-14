'use client';
import { Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from '@cs/ui';
import { formatDate, formatMoney } from '@/lib/format';
import { setAiDecisionModeAction } from '../actions';
import { MiniForm } from '../../_components/mini-form';

export interface AiDecisionModeData {
  mode: 'jev_only' | 'cascade';
  reevalUntil: string | null;
  window: { from: string; to: string; tasks: { task: string; samples: number; agreement: number | null; jevBelowTau: number | null; llmUsd: number }[] } | null;
}

const OPTIONS = [
  { value: 'jev_only', label: 'Jev only' },
  { value: 'cascade', label: 'Jev with LLM backup' },
] as const;

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

/** Staff card on /platform/costs: how Jev-primary decisions escalate, the 7-day re-evaluation window and its results. */
export function AiDecisionMode({ data, tz, now = new Date() }: { data: AiDecisionModeData; tz: string; now?: Date }) {
  const active = data.reevalUntil !== null && new Date(data.reevalUntil) > now;
  const win = data.window;
  return (
    <div className="flex flex-col gap-4">
      <MiniForm action={setAiDecisionModeAction} submit="Save">
        <fieldset className="flex flex-wrap items-center gap-4 text-sm">
          <legend className="sr-only">AI decisions</legend>
          {OPTIONS.map((o) => (
            <label key={o.value} className="flex items-center gap-2">
              <input type="radio" name="mode" value={o.value} defaultChecked={data.mode === o.value} />
              {o.label}
            </label>
          ))}
        </fieldset>
      </MiniForm>
      <div className="flex flex-col gap-2">
        {active && <p className="text-sm text-ink">{`Re-evaluating until ${formatDate(data.reevalUntil!, { tz, withYear: 'auto' })}`}</p>}
        <MiniForm action={setAiDecisionModeAction} submit={active ? 'Stop re-evaluation' : 'Re-evaluate with all models for 7 days'} variant="outline">
          <input type="hidden" name="reeval" value={active ? 'stop' : 'start'} />
        </MiniForm>
      </div>
      {win && win.tasks.length > 0 && (
        <TableFrame>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead numeric>Samples</TableHead>
                <TableHead numeric>Agreement</TableHead>
                <TableHead numeric>Jev unsure</TableHead>
                <TableHead numeric>LLM cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {win.tasks.map((t) => (
                <TableRow key={t.task}>
                  <TableCell>{t.task}</TableCell>
                  <TableCell numeric>{t.samples}</TableCell>
                  <TableCell numeric>{pct(t.agreement)}</TableCell>
                  <TableCell numeric>{pct(t.jevBelowTau)}</TableCell>
                  <TableCell numeric>{formatMoney(t.llmUsd, { cents: true })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      )}
    </div>
  );
}
