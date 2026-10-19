'use client';
import { Button } from '@cs/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { ErrorNote } from '@/components/form-error';
import { useReadOnly } from '@/components/read-only';
import { ItemCard, type RunFn } from './item-card';
import { KnobCard, type KnobName } from './knob-card';
import type { RunbookAction, RunbookData } from './types';

const POLL_MS = 5_000;
const GIVE_UP_MS = 5 * 60_000;
const KNOBS: KnobName[] = ['thresholds', 'focus_areas', 'tier_limits'];

/** Same shape as `useSetupPoll` (setup wizard): re-checks every 5 s while tailoring is pending, gives up after 5 minutes, and re-fetches the page once the status moves on. */
function useTailorPoll(pending: boolean, statusAction: (() => Promise<string | null>) | undefined) {
  const { refresh } = useRouter();
  useEffect(() => {
    if (!pending || !statusAction) return;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const schedule = () => {
      if (Date.now() - started >= GIVE_UP_MS) return;
      timer = setTimeout(check, POLL_MS);
    };
    const check = async () => {
      const status = await statusAction().catch(() => 'pending');
      if (stopped) return;
      if (status !== 'pending') {
        refresh();
        return;
      }
      schedule();
    };
    schedule();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [pending, statusAction, refresh]);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

/** One editor for the platform, agency and client runbooks (the level comes from `data`). Writes go through `action`, one server action per page. */
export function RunbookEditor({ data, canEdit: canEditProp, action, statusAction, verticalName }: {
  data: RunbookData;
  /** The viewer's role may edit at this level (the tools enforce it again). */
  canEdit: boolean;
  action: RunbookAction;
  /** Client level: the current `tailorStatus`, for polling while tailoring runs. */
  statusAction?: () => Promise<string | null>;
  verticalName?: string;
}) {
  const readOnlySession = useReadOnly();
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, startCreate] = useTransition();
  const { level } = data;
  const hasRunbook = level !== 'client' || data.source === 'client';
  const tailoring = data.tailorStatus === 'pending';
  useTailorPoll(tailoring, statusAction);
  const mayWrite = canEditProp && !readOnlySession;
  const canEdit = mayWrite && hasRunbook && !tailoring;

  // The refusal lives here (always mounted), so it survives the revalidation that re-renders the cards.
  const run: RunFn = async (op) => {
    const r = await action(op);
    setNotice(r.ok ? null : r.error);
    return r;
  };

  const plays = data.items.filter((i) => i.kind === 'play');
  const rules = data.items.filter((i) => i.kind === 'self_rule');
  const knob = (n: KnobName) => data.items.find((i) => i.key === `knob:${n}`);
  const card = (item: (typeof data.items)[number]) => (
    <ItemCard key={`${item.key}:${item.version}:${item.state}`} item={item} level={level} vars={data.vars} businessAreas={data.businessAreas} canEdit={canEdit} run={run} />
  );

  return (
    <div className="flex flex-col gap-6">
      {level === 'client' && !hasRunbook && (
        <div className="flex flex-col gap-3 rounded-[14px] bg-surface p-6 shadow-card">
          <p className="font-semibold">This client uses the agency runbook.</p>
          {mayWrite && (
            <div>
              <Button disabled={creating} onClick={() => startCreate(async () => void (await run({ op: 'create' })))}>Create a runbook for this client</Button>
            </div>
          )}
        </div>
      )}
      {tailoring && <p role="status" className="rounded-lg bg-muted-surface p-3 text-ink">Tailoring plays for {verticalName ?? 'this business'}…</p>}
      {data.tailorStatus === 'failed' && (
        <p role="status" className="rounded-lg bg-muted-surface p-3 text-ink">We couldn’t tailor these plays. They match the agency runbook; edit them as needed.</p>
      )}
      {notice && <ErrorNote focusKey={notice}>{notice}</ErrorNote>}
      <Section title="Plays">
        {plays.length === 0 ? <p className="text-muted-foreground">No plays yet.</p> : <div className="grid gap-5 xl:grid-cols-2">{plays.map(card)}</div>}
      </Section>
      <Section title="Starting-point rules">
        {rules.length === 0 ? <p className="text-muted-foreground">No rules yet.</p> : <div className="grid gap-5 xl:grid-cols-2">{rules.map(card)}</div>}
      </Section>
      <Section title="Settings">
        <div className="grid gap-5 xl:grid-cols-2">
          {KNOBS.map((n) => {
            const item = knob(n);
            return <KnobCard key={`${n}:${item?.version ?? 0}:${item?.state ?? ''}:${JSON.stringify(item?.content ?? null)}`} name={n} item={item} level={level} businessAreas={data.businessAreas} canEdit={canEdit} run={run} />;
          })}
        </div>
      </Section>
    </div>
  );
}
