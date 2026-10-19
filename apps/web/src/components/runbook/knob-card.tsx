'use client';
import { Badge, Button, Input, Label } from '@cs/ui';
import { useState } from 'react';
import { badgeFor, EnabledSwitch, type RunFn, UpdatePrompts, useCardRun } from './item-card';
import type { RunbookItemData, RunbookLevel } from './types';

export type KnobName = 'thresholds' | 'focus_areas' | 'tier_limits';
interface Tiers { top: { overlap: number; activity: number }; watch: { overlap: number; activity: number } }

const KNOB_TITLE: Record<KnobName, string> = {
  thresholds: 'Alert and brief thresholds',
  focus_areas: 'Focus services',
  tier_limits: 'Competitor tiers',
};

/** The same refusal copy as `/settings/alerts` (`validateThresholds` in the tools), checked before the call so the form answers at once. */
export function thresholdError(alert: number, brief: number): string | null {
  const whole = (n: number, lo: number, hi: number) => Number.isInteger(n) && n >= lo && n <= hi;
  if (!whole(alert, 2, 100)) return 'The alert threshold must be a whole number from 2 to 100.';
  if (!whole(brief, 1, 99)) return 'The brief threshold must be a whole number from 1 to 99.';
  if (brief >= alert) return 'The brief threshold must be lower than the alert threshold.';
  return null;
}

function Field({ id, label, value, onChange, ...rest }: { id: string; label: string; value: string; onChange: (v: string) => void } & Pick<React.ComponentProps<typeof Input>, 'min' | 'max' | 'step' | 'disabled'>) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" value={value} onChange={(e) => onChange(e.target.value)} className="w-32" {...rest} />
    </div>
  );
}

export function KnobCard({ name, item, level, businessAreas, canEdit, run }: {
  name: KnobName;
  /** Absent until someone sets it; saving then creates it. */
  item: RunbookItemData | undefined;
  level: RunbookLevel;
  businessAreas: { id: string; name: string }[];
  canEdit: boolean;
  run: RunFn;
}) {
  const key = `knob:${name}`;
  const { pending, go } = useCardRun(run);
  const [error, setError] = useState<string | null>(null);
  const th = name === 'thresholds' ? ((item?.content ?? null) as { alert: number; brief: number } | null) : null;
  const [alert, setAlert] = useState(th ? String(th.alert) : '');
  const [brief, setBrief] = useState(th ? String(th.brief) : '');
  const tiers = name === 'tier_limits' ? ((item?.content ?? null) as Tiers | null) : null;
  const [t, setT] = useState({ to: tiers ? String(tiers.top.overlap) : '', ta: tiers ? String(tiers.top.activity) : '', wo: tiers ? String(tiers.watch.overlap) : '', wa: tiers ? String(tiers.watch.activity) : '' });
  const [areas, setAreas] = useState<string[]>(item ? ((item.content as { areaIds?: string[] }).areaIds ?? []) : []);
  const badge = item ? badgeFor(item, level) : null;
  // A setting that is only on offer from above (not yet added) shows just its Add / Not now prompt.
  if (item?.state === 'new_upstream') {
    return (
      <div className="flex flex-col gap-3 rounded-[14px] bg-surface p-6 shadow-card" data-item={key}>
        <div className="flex flex-wrap items-center gap-2">
          {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
          <h3 className="font-semibold">{KNOB_TITLE[name]}</h3>
        </div>
        <UpdatePrompts item={item} level={level} canEdit={canEdit} run={run} />
      </div>
    );
  }
  const save = (content: unknown) => go({ op: 'save', key, content }, (r) => setError(r.ok ? null : r.error));

  const saveThresholds = () => {
    const msg = thresholdError(Number(alert), Number(brief));
    if (msg) return setError(msg);
    setError(null);
    save({ alert: Number(alert), brief: Number(brief) });
  };
  const saveTiers = () => {
    const n = [t.to, t.ta, t.wo, t.wa].map((v) => (v.trim() === '' ? Number.NaN : Number(v)));
    if (n.some((v) => !(v >= 0 && v <= 1))) return setError('Enter each tier limit as a number from 0 to 1.');
    setError(null);
    save({ top: { overlap: n[0], activity: n[1] }, watch: { overlap: n[2], activity: n[3] } });
  };

  return (
    <div className="flex flex-col gap-3 rounded-[14px] bg-surface p-6 shadow-card" data-item={key}>
      <div className="flex flex-wrap items-center gap-2">
        {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
        <h3 className="font-semibold">{KNOB_TITLE[name]}</h3>
        {item && <div className="ml-auto"><EnabledSwitch item={item} label={KNOB_TITLE[name]} canEdit={canEdit} run={run} /></div>}
      </div>
      {name === 'thresholds' && (
        <>
          <p className="text-sm text-muted-ink">Every competitor change gets a score from 0 to 100. From the alert score: an instant alert. From the brief score up to that: the weekly brief.</p>
          <div className="flex flex-wrap gap-6">
            <Field id="rb-brief" label="Weekly brief from score" value={brief} onChange={setBrief} min={1} max={99} step={1} disabled={!canEdit} />
            <Field id="rb-alert" label="Instant alert from score" value={alert} onChange={setAlert} min={2} max={100} step={1} disabled={!canEdit} />
          </div>
          {canEdit && <div><Button size="sm" disabled={pending} onClick={saveThresholds}>Save thresholds</Button></div>}
        </>
      )}
      {name === 'focus_areas' && (
        businessAreas.length === 0 ? (
          <p className="text-sm text-muted-ink">Focus services are chosen on each client’s runbook.</p>
        ) : (
          <>
            <p className="text-sm text-muted-ink">Plays and findings for these services come first in the weekly brief.</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {businessAreas.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" disabled={!canEdit} checked={areas.includes(a.id)} onChange={(e) => setAreas(e.target.checked ? [...areas, a.id] : areas.filter((x) => x !== a.id))} />
                  {a.name}
                </label>
              ))}
            </div>
            {canEdit && <div><Button size="sm" disabled={pending} onClick={() => save({ areaIds: areas })}>Save focus services</Button></div>}
          </>
        )
      )}
      {name === 'tier_limits' && (
        <>
          <p className="text-sm text-muted-ink">{item ? 'How closely a competitor must overlap and how active it must be to rank as a top rival or one worth watching (0 to 1).' : 'Using the business type’s standard limits. Set your own below (0 to 1).'}</p>
          <div className="flex flex-wrap gap-6">
            <Field id="rb-top-overlap" label="Top rival: overlap from" value={t.to} onChange={(v) => setT({ ...t, to: v })} min={0} max={1} step={0.05} disabled={!canEdit} />
            <Field id="rb-top-activity" label="Top rival: activity from" value={t.ta} onChange={(v) => setT({ ...t, ta: v })} min={0} max={1} step={0.05} disabled={!canEdit} />
            <Field id="rb-watch-overlap" label="Worth watching: overlap from" value={t.wo} onChange={(v) => setT({ ...t, wo: v })} min={0} max={1} step={0.05} disabled={!canEdit} />
            <Field id="rb-watch-activity" label="Worth watching: activity from" value={t.wa} onChange={(v) => setT({ ...t, wa: v })} min={0} max={1} step={0.05} disabled={!canEdit} />
          </div>
          {canEdit && <div><Button size="sm" disabled={pending} onClick={saveTiers}>Save tier limits</Button></div>}
        </>
      )}
      {error && <p role="alert" className="rounded-lg bg-muted-surface p-3 text-sm text-ink">{error}</p>}
      {item && <UpdatePrompts item={item} level={level} canEdit={canEdit} run={run} />}
    </div>
  );
}
