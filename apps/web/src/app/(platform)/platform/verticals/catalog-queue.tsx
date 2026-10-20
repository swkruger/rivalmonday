'use client';
import { Button, Input, Label } from '@cs/ui';
import { useActionState, useState } from 'react';
import { ErrorNote } from '@/components/form-error';
import { WriteGuard } from '@/components/read-only';
import type { FormResult } from '@/server/forms';

type Action = (prev: FormResult, fd: FormData) => Promise<FormResult>;

interface Creator { agencyId: string; name: string }
export interface ReviewVertical {
  id: string;
  name: string;
  services: { id: string; name: string }[];
  createdBy: Creator | null;
  clientCount: number;
  evidence: unknown;
  draftCostUsd: number | null;
  categories: string[];
  detail: { audienceNoun: string; seedKeywords: string[]; primaryCategories: string[]; relatedCategories: string[]; themes: string[]; areas: { id: string; name: string; aliases: string[] }[] };
}
export interface ReviewArea {
  verticalId: string;
  verticalName: string;
  id: string;
  name: string;
  aliases: string[];
  createdBy: Creator | null;
  clientCount: number;
  evidence: unknown;
}
export interface TargetVertical { id: string; name: string; status: string; services: { id: string; name: string }[] }

interface Props {
  verticals: ReviewVertical[];
  areas: ReviewArea[];
  /** Reviewed business types a vertical can merge into. */
  targets: TargetVertical[];
  /** Every business type (an area merges into a sibling of its own type). */
  catalogue: TargetVertical[];
  /** source vertical -> target vertical -> source area -> target area (null = move). */
  defaultMaps: Record<string, Record<string, Record<string, string | null>>>;
  canEdit: boolean;
  action: Action;
}

const card = 'flex flex-col gap-3 rounded-[14px] bg-surface p-6 shadow-card';
const selectClass = 'h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';
const chip = 'inline-flex items-center rounded-full bg-muted-surface px-3 py-1 text-sm font-semibold text-ink';

/** Every `quote` string in a draft's evidence (areas, keywords, themes), deduplicated. */
export function quotesOf(evidence: unknown): string[] {
  const out = new Set<string>();
  const walk = (x: unknown, depth: number) => {
    if (depth > 6 || x === null) return;
    if (typeof x === 'string') return;
    if (Array.isArray(x)) return x.forEach((e) => walk(e, depth + 1));
    if (typeof x === 'object') {
      for (const [k, v] of Object.entries(x)) {
        if (k === 'quote' && typeof v === 'string' && v.trim()) out.add(v.trim());
        else walk(v, depth + 1);
      }
    }
  };
  walk(evidence, 0);
  return [...out].slice(0, 12);
}

const list = (s: string) => [...new Set(s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean))];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function Evidence({ evidence }: { evidence: unknown }) {
  const quotes = quotesOf(evidence);
  if (quotes.length === 0) return <p className="text-sm text-muted-ink">No evidence recorded.</p>;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-semibold text-ink">Evidence ({quotes.length})</summary>
      <ul className="mt-2 flex flex-col gap-1">
        {quotes.map((q) => <li key={q} className="rounded-lg bg-muted-surface p-2">“{q}”</li>)}
      </ul>
    </details>
  );
}

/** Hidden inputs + one submit button: every control posts the same action, told apart by `intent`. */
function Post({ fields, children }: { fields: Record<string, string>; children: React.ReactNode }) {
  return (
    <>
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
    </>
  );
}

export function CatalogQueue({ verticals, areas, targets, catalogue, defaultMaps, canEdit, action }: Props) {
  // One action state for every control, held here so the result survives the approved item leaving the list on revalidate.
  const [result, formAction, busy] = useActionState(action, { ok: true } as FormResult);
  return (
    <div className="flex flex-col gap-5">
      {!result.ok && <ErrorNote focusKey={result}>{result.error}</ErrorNote>}
      {result.ok && result.message && <p role="status" className="rounded-lg bg-muted-surface p-3 text-ink">{result.message}</p>}

      <h2 className="text-lg font-bold">New business types</h2>
      {verticals.length === 0 && <p className="text-muted-foreground">Nothing to review.</p>}
      {verticals.map((v) => <VerticalCard key={v.id} v={v} targets={targets.filter((t) => t.id !== v.id)} maps={defaultMaps[v.id] ?? {}} canEdit={canEdit} formAction={formAction} busy={busy} />)}

      <h2 className="text-lg font-bold">New services</h2>
      {areas.length === 0 && <p className="text-muted-foreground">Nothing to review.</p>}
      {areas.map((a) => <AreaCard key={`${a.verticalId}/${a.id}`} a={a} siblings={(catalogue.find((c) => c.id === a.verticalId)?.services ?? []).filter((s) => s.id !== a.id)} canEdit={canEdit} formAction={formAction} busy={busy} />)}
    </div>
  );
}

type Mode = 'none' | 'rename' | 'edit' | 'merge';
interface Shared { formAction: (fd: FormData) => void; busy: boolean; canEdit: boolean }

function Meta({ createdBy, clientCount, extra }: { createdBy: Creator | null; clientCount: number; extra?: string }) {
  return (
    <div className="text-sm text-muted-ink">
      Added by {createdBy?.name || 'an agency'} · {clientCount} {clientCount === 1 ? 'client' : 'clients'}{extra ? ` · ${extra}` : ''}
    </div>
  );
}

function ModeButtons({ name, mode, setMode, busy, approve }: { name: string; mode: Mode; setMode: (m: Mode) => void; busy: boolean; approve: React.ReactNode }) {
  const toggle = (m: Mode) => setMode(mode === m ? 'none' : m);
  return (
    <div className="flex flex-wrap gap-2">
      {approve}
      <Button type="button" variant="outline" aria-label={`Rename ${name}`} disabled={busy} onClick={() => toggle('rename')}>Rename</Button>
      <Button type="button" variant="outline" aria-label={`Merge ${name} into another`} disabled={busy} onClick={() => toggle('merge')}>Merge into…</Button>
    </div>
  );
}

function RenameForm({ intent, id, verticalId, current, formAction, busy, onDone }: { intent: string; id: string; verticalId?: string; current: string; formAction: Shared['formAction']; busy: boolean; onDone: () => void }) {
  const [name, setName] = useState(current);
  return (
    <form action={(fd) => { formAction(fd); onDone(); }} className="flex flex-wrap items-end gap-2">
      <Post fields={{ intent, id, ...(verticalId ? { verticalId } : {}) }}>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`rename-${id}`}>New name</Label>
          <Input id={`rename-${id}`} name="name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="w-72" />
        </div>
        <Button type="submit" disabled={busy || name.trim().length < 2}>Save name</Button>
      </Post>
    </form>
  );
}

function VerticalCard({ v, targets, maps, canEdit, formAction, busy }: { v: ReviewVertical; targets: TargetVertical[]; maps: Record<string, Record<string, string | null>>; canEdit: boolean; formAction: Shared['formAction']; busy: boolean }) {
  const [mode, setMode] = useState<Mode>('none');
  const [editing, setEditing] = useState(false);
  return (
    <div className={card}>
      <h3 className="text-lg font-bold">{v.name} <span className="font-mono text-xs text-muted-ink">{v.id}</span></h3>
      <Meta createdBy={v.createdBy} clientCount={v.clientCount} extra={v.draftCostUsd !== null ? `draft cost $${v.draftCostUsd.toFixed(3)}` : undefined} />
      {v.categories.length > 0 && <div className="flex flex-wrap gap-2" aria-label="Google categories">{v.categories.map((c) => <span key={c} className={chip}>{c}</span>)}</div>}
      {v.services.length > 0 && <p className="text-sm"><span className="font-semibold">Services:</span> {v.services.map((s) => s.name).join(', ')}</p>}
      <Evidence evidence={v.evidence} />
      <WriteGuard>
        {canEdit && (
          <>
            <ModeButtons
              name={v.name}
              mode={mode}
              setMode={(m) => { setMode(m); setEditing(false); }}
              busy={busy}
              approve={
                <>
                  <form action={formAction}>
                    <Post fields={{ intent: 'approve-vertical', id: v.id, label: v.name }}>
                      <Button type="submit" aria-label={`Approve ${v.name}`} disabled={busy}>Approve</Button>
                    </Post>
                  </form>
                  <Button type="button" variant="outline" aria-label={`Edit ${v.name}`} disabled={busy} onClick={() => { setEditing((e) => !e); setMode('none'); }}>Edit</Button>
                </>
              }
            />
            {mode === 'rename' && <RenameForm intent="rename-vertical" id={v.id} current={v.name} formAction={formAction} busy={busy} onDone={() => setMode('none')} />}
            {editing && <EditForm v={v} formAction={formAction} busy={busy} onDone={() => setEditing(false)} />}
            {mode === 'merge' && <MergeForm v={v} targets={targets} maps={maps} formAction={formAction} busy={busy} onDone={() => setMode('none')} />}
          </>
        )}
      </WriteGuard>
    </div>
  );
}

function EditForm({ v, formAction, busy, onDone }: { v: ReviewVertical; formAction: Shared['formAction']; busy: boolean; onDone: () => void }) {
  const d = v.detail;
  const [name, setName] = useState(v.name);
  const [noun, setNoun] = useState(d.audienceNoun);
  const [keywords, setKeywords] = useState(d.seedKeywords.join(', '));
  const [primary, setPrimary] = useState(d.primaryCategories.join(', '));
  const [related, setRelated] = useState(d.relatedCategories.join(', '));
  const [themes, setThemes] = useState(d.themes.join(', '));
  const [areaRows, setAreaRows] = useState(d.areas.map((a) => ({ ...a, aliasText: a.aliases.join(', '), keep: true })));
  const [added, setAdded] = useState('');

  // Only what changed is sent: update_vertical leaves omitted fields as they are (a theme rewrite would drop its descriptions).
  const payload = (): Record<string, unknown> => {
    const p: Record<string, unknown> = {};
    if (name.trim() !== v.name) p.name = name.trim();
    if (noun.trim() !== d.audienceNoun && noun.trim()) p.audienceNoun = noun.trim();
    if (!same(list(keywords), d.seedKeywords)) p.seedKeywords = list(keywords);
    if (!same(list(primary), d.primaryCategories)) p.categories = list(primary);
    if (!same(list(related), d.relatedCategories)) p.relatedCategories = list(related);
    if (!same(list(themes), d.themes)) p.themes = list(themes).map((t) => ({ name: t }));
    const rows = areaRows.filter((r) => r.keep).map((r) => ({ id: r.id, name: r.name.trim(), aliases: list(r.aliasText) }));
    const fresh = list(added).map((n) => ({ name: n }));
    const original = d.areas.map((a) => ({ id: a.id, name: a.name, aliases: a.aliases }));
    if (!same(rows, original) || fresh.length) p.areas = [...rows, ...fresh];
    return p;
  };
  const p = payload();
  return (
    <form action={(fd) => { formAction(fd); onDone(); }} aria-label={`Edit ${v.name}`} className="flex flex-col gap-3 rounded-lg bg-muted-surface p-4">
      <Post fields={{ intent: 'edit-vertical', id: v.id, label: v.name, payload: JSON.stringify(p) }}>
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1"><Label htmlFor={`e-name-${v.id}`}>Business type name</Label><Input id={`e-name-${v.id}`} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className="w-64" /></div>
          <div className="flex flex-col gap-1"><Label htmlFor={`e-noun-${v.id}`}>Audience noun</Label><Input id={`e-noun-${v.id}`} value={noun} maxLength={40} onChange={(e) => setNoun(e.target.value)} className="w-48" /></div>
        </div>
        <div className="flex flex-col gap-1"><Label htmlFor={`e-kw-${v.id}`}>Keywords (comma separated, up to 5)</Label><Input id={`e-kw-${v.id}`} value={keywords} onChange={(e) => setKeywords(e.target.value)} /></div>
        <div className="flex flex-col gap-1"><Label htmlFor={`e-cat-${v.id}`}>Google categories</Label><Input id={`e-cat-${v.id}`} value={primary} onChange={(e) => setPrimary(e.target.value)} /></div>
        <div className="flex flex-col gap-1"><Label htmlFor={`e-rel-${v.id}`}>Related Google categories</Label><Input id={`e-rel-${v.id}`} value={related} onChange={(e) => setRelated(e.target.value)} /></div>
        <div className="flex flex-col gap-1"><Label htmlFor={`e-th-${v.id}`}>Review topics (comma separated)</Label><Input id={`e-th-${v.id}`} value={themes} onChange={(e) => setThemes(e.target.value)} /></div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Services</legend>
          {areaRows.map((r, i) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2">
              <input type="checkbox" aria-label={`Keep ${r.name}`} checked={r.keep} className="h-4 w-4" onChange={() => setAreaRows(areaRows.map((x, j) => (j === i ? { ...x, keep: !x.keep } : x)))} />
              <Input aria-label={`Name of ${r.name}`} value={r.name} maxLength={80} className="w-56" onChange={(e) => setAreaRows(areaRows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <Input aria-label={`Other names for ${r.name}`} value={r.aliasText} placeholder="Other names" className="w-64" onChange={(e) => setAreaRows(areaRows.map((x, j) => (j === i ? { ...x, aliasText: e.target.value } : x)))} />
            </div>
          ))}
          <div className="flex flex-col gap-1"><Label htmlFor={`e-add-${v.id}`}>Add services (comma separated)</Label><Input id={`e-add-${v.id}`} value={added} onChange={(e) => setAdded(e.target.value)} /></div>
        </fieldset>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || Object.keys(p).length === 0}>Save changes</Button>
          <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        </div>
      </Post>
    </form>
  );
}

function MergeForm({ v, targets, maps, formAction, busy, onDone }: { v: ReviewVertical; targets: TargetVertical[]; maps: Record<string, Record<string, string | null>>; formAction: Shared['formAction']; busy: boolean; onDone: () => void }) {
  const [targetId, setTargetId] = useState('');
  const [map, setMap] = useState<Record<string, string | null>>({});
  const target = targets.find((t) => t.id === targetId);
  const choose = (id: string) => {
    setTargetId(id);
    setMap(maps[id] ?? {});
  };
  return (
    <form action={(fd) => { formAction(fd); onDone(); }} aria-label={`Merge ${v.name}`} className="flex flex-col gap-3 rounded-lg bg-muted-surface p-4">
      <Post fields={{ intent: 'merge-vertical', id: v.id, label: v.name, targetId, payload: JSON.stringify(map) }}>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`m-target-${v.id}`}>Merge into</Label>
          <select id={`m-target-${v.id}`} value={targetId} onChange={(e) => choose(e.target.value)} className={`${selectClass} max-w-sm`}>
            <option value="">Choose a business type</option>
            {targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        {target && v.services.length > 0 && (
          <table className="text-sm">
            <thead><tr><th className="pr-4 text-left">Service</th><th className="text-left">Becomes</th></tr></thead>
            <tbody>
              {v.services.map((s) => (
                <tr key={s.id}>
                  <td className="py-1 pr-4">{s.name}</td>
                  <td>
                    <select aria-label={`Where ${s.name} goes`} value={map[s.id] ?? ''} className={selectClass} onChange={(e) => setMap({ ...map, [s.id]: e.target.value || null })}>
                      <option value="">Move (keep as a new service)</option>
                      {target.services.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || !target}>Merge</Button>
          <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        </div>
      </Post>
    </form>
  );
}

function AreaCard({ a, siblings, canEdit, formAction, busy }: { a: ReviewArea; siblings: { id: string; name: string }[]; canEdit: boolean; formAction: Shared['formAction']; busy: boolean }) {
  const [mode, setMode] = useState<Mode>('none');
  const [targetId, setTargetId] = useState('');
  return (
    <div className={card}>
      <div className="text-sm text-muted-ink">{a.verticalName}</div>
      <h3 className="text-lg font-bold">{a.name} <span className="font-mono text-xs text-muted-ink">{a.id}</span></h3>
      <Meta createdBy={a.createdBy} clientCount={a.clientCount} />
      {a.aliases.length > 0 && <div className="flex flex-wrap gap-2" aria-label="Other names">{a.aliases.map((x) => <span key={x} className={chip}>{x}</span>)}</div>}
      <Evidence evidence={a.evidence} />
      <WriteGuard>
        {canEdit && (
          <>
            <ModeButtons
              name={a.name}
              mode={mode}
              setMode={setMode}
              busy={busy}
              approve={
                <form action={formAction}>
                  <Post fields={{ intent: 'approve-area', id: a.id, verticalId: a.verticalId, label: a.name }}>
                    <Button type="submit" aria-label={`Approve ${a.name}`} disabled={busy}>Approve</Button>
                  </Post>
                </form>
              }
            />
            {mode === 'rename' && <RenameForm intent="rename-area" id={a.id} verticalId={a.verticalId} current={a.name} formAction={formAction} busy={busy} onDone={() => setMode('none')} />}
            {mode === 'merge' && (
              <form action={(fd) => { formAction(fd); setMode('none'); }} aria-label={`Merge ${a.name}`} className="flex flex-wrap items-end gap-2 rounded-lg bg-muted-surface p-4">
                <Post fields={{ intent: 'merge-area', id: a.id, verticalId: a.verticalId, label: a.name, targetId }}>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`am-${a.verticalId}-${a.id}`}>Merge into</Label>
                    <select id={`am-${a.verticalId}-${a.id}`} value={targetId} onChange={(e) => setTargetId(e.target.value)} className={selectClass}>
                      <option value="">Choose a service</option>
                      {siblings.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <Button type="submit" disabled={busy || !targetId}>Merge</Button>
                </Post>
              </form>
            )}
          </>
        )}
      </WriteGuard>
    </div>
  );
}
