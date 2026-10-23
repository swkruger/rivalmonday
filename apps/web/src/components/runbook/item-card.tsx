'use client';
import type { ChipTone } from '@cs/ui';
import { changeTypeLabel } from '@cs/email/labels';
import { Button, ConfirmDialog, Input, Label, StatusChip, Switch } from '@cs/ui';
import { useOptimistic, useState, useTransition } from 'react';
import { DiffView } from './diff';
import type { RunbookActionResult, RunbookItemData, RunbookLevel, RunbookOp, Tailoring } from './types';

export type RunFn = (op: RunbookOp) => Promise<RunbookActionResult>;

export interface PlayContent {
  trigger: string;
  title: string;
  template: string;
  effort?: 'L' | 'M' | 'H';
  impact?: 'L' | 'M' | 'H';
}

const area = 'w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';
const LEVEL_WORD = { L: 'Low', M: 'Medium', H: 'High' } as const;
/** The same fallbacks `renderPlaybook` (engine) uses when a brief has no value for a placeholder. */
const FALLBACK: Record<string, string> = { competitor: 'the competitor', service: 'this service', new_price: 'a lower price', areas: 'new areas', topic: 'this topic' };

export const renderPreview = (template: string): string => template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k: string) => FALLBACK[k] ?? 'this');
const pretty = (id: string) => id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** What the level above is called in the prompts. The platform level is "standard" to agencies. */
export const parentName = (level: RunbookLevel): string => (level === 'client' ? 'agency runbook' : 'standard runbook');

export function badgeFor(item: RunbookItemData, level: RunbookLevel): { label: string; tone: ChipTone } | null {
  if (level === 'platform') return null; // the base level has nothing above it to inherit from
  if (item.state === 'new_upstream') return { label: 'New', tone: 'info' };
  if (item.state === 'removed_upstream') return { label: 'Removed upstream', tone: 'warning' };
  if (item.state === 'update_available') return { label: 'Update available', tone: 'info' };
  return item.customised ? { label: 'Customised', tone: 'neutral' } : { label: 'Inherited', tone: 'neutral' };
}

export function itemTitle(item: RunbookItemData): string {
  const c = item.content as { title?: string; id?: string };
  if (item.kind === 'play') return c.title ?? item.key;
  if (item.kind === 'self_rule') return pretty(c.id ?? item.key.replace(/^self_rule:/, ''));
  return item.key;
}

const noun = (kind: RunbookItemData['kind']) => (kind === 'play' ? 'play' : kind === 'self_rule' ? 'rule' : 'setting');
const textOf = (content: unknown): string => (typeof content === 'string' ? content : JSON.stringify(content, null, 1));

/** Hook for one card's writes: pending flag plus the shared `run` (its result is surfaced by the always-mounted editor). */
export function useCardRun(run: RunFn) {
  const [pending, start] = useTransition();
  const go = (op: RunbookOp, then?: (r: RunbookActionResult) => void) => start(async () => {
    const r = await run(op); // not inside `then?.(…)`: an absent callback would short-circuit the call
    then?.(r);
  });
  return { pending, go };
}

/** The three prompts for an item that differs from the level above: update available (diff), new upstream, removed upstream. */
export function UpdatePrompts({ item, level, canEdit, run }: { item: RunbookItemData; level: RunbookLevel; canEdit: boolean; run: RunFn }) {
  const { pending, go } = useCardRun(run);
  const [stage, setStage] = useState<'idle' | 'diff' | 'tailored'>('idle');
  const [proposed, setProposed] = useState<Tailoring | null>(null);
  const [hidden, setHidden] = useState(false);
  const parent = item.parent;
  const name = parentName(level);
  const key = item.key;
  const box = 'flex flex-col gap-2 rounded-lg bg-muted-surface p-3 text-sm';

  if (item.state === 'new_upstream') {
    if (hidden) return null;
    return (
      <div className={box}>
        <p className="font-semibold">New {noun(item.kind)} available</p>
        {canEdit && (
          <div className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={() => go({ op: 'add', key })}>Add</Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setHidden(true)}>Not now</Button>
          </div>
        )}
      </div>
    );
  }
  if (item.state === 'removed_upstream') {
    if (hidden) return null;
    return (
      <div className={box}>
        <p className="font-semibold">No longer in the {name}</p>
        {canEdit && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setHidden(true)}>Keep</Button>
            <ConfirmDialog
              trigger={<Button size="sm" disabled={pending}>Remove</Button>}
              title={`Remove this ${noun(item.kind)}?`}
              body={`It is no longer in the ${name}. Removing it deletes it from this runbook.`}
              confirmLabel="Remove"
              tone="danger"
              action={async () => { await run({ op: 'remove', key }); }}
            />
          </div>
        )}
      </div>
    );
  }
  if (item.state !== 'update_available' || !parent) return null;

  if (stage === 'idle') {
    return (
      <div className={box}>
        <p>A newer version is available from the {name}.</p>
        <div><Button size="sm" variant="outline" onClick={() => setStage('diff')}>Review update</Button></div>
      </div>
    );
  }
  const mine = item.content as Partial<PlayContent>;
  const theirs = parent.content as Partial<PlayContent>;
  // "Before" is what the level above looked like when this item last took it, so a customised item's own edits don't read as upstream changes.
  const beforeContent = item.upstreamSnapshot?.content ?? item.content;
  const before = beforeContent as Partial<PlayContent>;
  if (stage === 'tailored') {
    const p = proposed;
    return (
      <div className={box}>
        <p className="font-semibold">Tailored for this client</p>
        {p ? (
          <>
            <p className="font-semibold">{p.title}</p>
            <p className="whitespace-pre-wrap">{p.template}</p>
          </>
        ) : <p>We couldn’t tailor this update for the client. You can use the {name} text as it is.</p>}
        {canEdit && (
          <div className="flex gap-2">
            {p && <Button size="sm" disabled={pending} onClick={() => go({ op: 'pull', key, content: { ...theirs, title: p.title, template: p.template }, businessAreaIds: p.businessAreaIds })}>Approve</Button>}
            <Button size="sm" variant="outline" disabled={pending} onClick={() => go({ op: 'pull', key })}>Use as is</Button>
          </div>
        )}
      </div>
    );
  }
  const play = item.kind === 'play';
  const useUpdate = () => {
    if (level === 'client' && play) {
      go({ op: 'retailor', key }, (r) => {
        setProposed(r.ok ? r.proposed ?? null : null);
        if (r.ok) setStage('tailored');
      });
    } else go({ op: 'pull', key });
  };
  return (
    <div className={box}>
      <p className="font-semibold">What changed in the {name}</p>
      {play ? (
        <>
          {before.title !== theirs.title && <DiffView before={before.title ?? ''} after={theirs.title ?? ''} label="the title" />}
          {before.template !== theirs.template && <DiffView before={before.template ?? ''} after={theirs.template ?? ''} label="the template" />}
          {item.customised && (
            <div data-testid="runbook-yours" className="flex flex-col gap-1 text-muted-ink">
              <p className="font-semibold">Your version</p>
              <p>{mine.title}</p>
              <p className="whitespace-pre-wrap">{mine.template}</p>
            </div>
          )}
        </>
      ) : <DiffView before={textOf(beforeContent)} after={textOf(parent.content)} label="this item" />}
      {canEdit && (
        <div className="flex gap-2">
          {item.customised ? (
            <ConfirmDialog
              trigger={<Button size="sm" disabled={pending}>Use the update</Button>}
              title="Replace your version?"
              body={`Your edits to this ${noun(item.kind)} are replaced by the version from the ${name}.`}
              confirmLabel="Use the update"
              action={async () => { useUpdate(); }}
            />
          ) : (
            <Button size="sm" disabled={pending} onClick={useUpdate}>Use the update</Button>
          )}
          <Button size="sm" variant="outline" disabled={pending} onClick={() => go({ op: 'dismiss', key })}>Keep mine</Button>
        </div>
      )}
    </div>
  );
}

/**
 * The on/off switch every item carries. Switching on is immediate and optimistic (same pattern as `AutoSendSwitch`); switching off
 * asks first, because the play, rule or setting stops applying at once. The result is surfaced by the editor.
 */
export function EnabledSwitch({ item, label, canEdit, run }: { item: RunbookItemData; label: string; canEdit: boolean; run: RunFn }) {
  const [checked, setChecked] = useOptimistic(item.enabled);
  const [pending, start] = useTransition();
  const disabled = !canEdit || pending || item.state === 'new_upstream';
  if (checked && !disabled) {
    return (
      <ConfirmDialog
        trigger={<Switch checked aria-label={`${label} on or off`} onCheckedChange={() => {}} />}
        title={`Switch off ${label}?`}
        body="It stops applying to briefs and alerts until you switch it back on."
        confirmLabel="Switch off"
        action={async () => { await run({ op: 'toggle', key: item.key, enabled: false }); }}
      />
    );
  }
  return (
    <Switch
      checked={checked}
      disabled={disabled}
      aria-label={`${label} on or off`}
      onCheckedChange={(next: boolean) => start(async () => {
        setChecked(next);
        await run({ op: 'toggle', key: item.key, enabled: next });
      })}
    />
  );
}

function PlayEditor({ item, level, vars, businessAreas, run, onDone }: { item: RunbookItemData; level: RunbookLevel; vars: string[]; businessAreas: { id: string; name: string }[]; run: RunFn; onDone: () => void }) {
  const c = item.content as PlayContent;
  const [title, setTitle] = useState(c.title);
  const [template, setTemplate] = useState(c.template);
  const [areas, setAreas] = useState<string[]>(item.businessAreaIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const { pending, go } = useCardRun(run);
  const withAreas = level === 'client' && businessAreas.length > 0;
  const id = item.key.replace(/[^a-z0-9]/gi, '-');
  const save = () => {
    const unknown = [...new Set([...template.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)].map((m) => m[1]!))].filter((n) => !vars.includes(n));
    if (title.includes('{{')) return setError('The title cannot contain placeholders.');
    if (unknown.length > 0) return setError(`Unknown placeholder {{${unknown[0]}}}. Use one of ${vars.map((v) => `{{${v}}}`).join(', ')}.`);
    setError(null);
    go(
      { op: 'save', key: item.key, content: { ...c, title, template }, ...(withAreas ? { businessAreaIds: areas.length > 0 ? areas : null } : {}) },
      (r) => {
        if (r.ok) onDone();
        else setError(r.error);
      },
    );
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`title-${id}`}>Title</Label>
        <Input id={`title-${id}`} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`template-${id}`}>Template</Label>
        <textarea id={`template-${id}`} value={template} rows={4} maxLength={2000} className={area} onChange={(e) => setTemplate(e.target.value)} />
        <p className="text-xs text-muted-ink">Placeholders: {vars.map((v) => `{{${v}}}`).join(' ')}</p>
      </div>
      {withAreas && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-medium">Only for these services</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {businessAreas.map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={areas.includes(a.id)} onChange={(e) => setAreas(e.target.checked ? [...areas, a.id] : areas.filter((x) => x !== a.id))} />
                {a.name}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-ink">Leave all unticked to use this play for every service.</p>
        </fieldset>
      )}
      {error && <p role="alert" className="rounded-lg bg-muted-surface p-3 text-sm text-ink">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={save}>Save</Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

export function ItemCard({ item, level, vars, businessAreas, canEdit, run }: {
  item: RunbookItemData;
  level: RunbookLevel;
  vars: string[];
  businessAreas: { id: string; name: string }[];
  /** Already combined with the read-only support session and the "has its own runbook" rule. */
  canEdit: boolean;
  run: RunFn;
}) {
  const [editing, setEditing] = useState(false);
  const badge = badgeFor(item, level);
  const title = itemTitle(item);
  const play = item.kind === 'play' ? (item.content as PlayContent) : null;
  const rule = item.kind === 'self_rule' ? (item.content as { weight?: number }) : null;
  const areaNames = (item.businessAreaIds ?? []).map((id) => businessAreas.find((a) => a.id === id)?.name ?? id);
  return (
    <div className="flex flex-col gap-3 rounded-[14px] bg-surface p-6 shadow-card" data-item={item.key}>
      <div className="flex flex-wrap items-center gap-2">
        {badge && <StatusChip tone={badge.tone}>{badge.label}</StatusChip>}
        {play && <StatusChip tone="neutral">{changeTypeLabel(play.trigger)}</StatusChip>}
        {play?.effort && <StatusChip tone="neutral">Effort: {LEVEL_WORD[play.effort]}</StatusChip>}
        {play?.impact && <StatusChip tone="neutral">Impact: {LEVEL_WORD[play.impact]}</StatusChip>}
        <div className="ml-auto"><EnabledSwitch item={item} label={title} canEdit={canEdit} run={run} /></div>
      </div>
      <h3 className="font-semibold">{title}</h3>
      {play && !editing && (
        <>
          <p className="whitespace-pre-wrap text-sm">{play.template}</p>
          {areaNames.length > 0 && <p className="text-xs text-muted-ink">Only for: {areaNames.join(', ')}</p>}
          {level === 'client' && (
            <details className="text-sm text-muted-ink">
              <summary>Preview</summary>
              <p className="mt-1 whitespace-pre-wrap text-ink">{renderPreview(play.template)}</p>
            </details>
          )}
          {canEdit && item.state !== 'new_upstream' && <div><Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit</Button></div>}
        </>
      )}
      {play && editing && <PlayEditor item={item} level={level} vars={vars} businessAreas={businessAreas} run={run} onDone={() => setEditing(false)} />}
      {rule && <p className="text-sm text-muted-ink">{rule.weight !== undefined ? `Weight ${rule.weight}. ` : ''}Switch it off to leave it out of the starting-point brief.</p>}
      <UpdatePrompts item={item} level={level} canEdit={canEdit} run={run} />
    </div>
  );
}
