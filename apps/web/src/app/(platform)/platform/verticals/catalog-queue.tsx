'use client';
import { Band, Button, Card, ConfirmDialog, Input, Label, nativeSelectClass, Section, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tag } from '@cs/ui';
import { useActionState, useState } from 'react';
import { ErrorNote } from '@/components/form-error';
import { HelpEmpty } from '@/components/help/empty-state';
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
  detail: { audienceNoun: string; seedKeywords: string[]; primaryCategories: string[]; relatedCategories: string[]; topics: string[]; areas: { id: string; name: string; aliases: string[] }[] };
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

const selectClass = nativeSelectClass;

/** Every `quote` string in a draft's evidence (areas, keywords, topics), deduplicated. */
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
        {quotes.map((q) => <li key={q}><Band tone="muted" className="p-2">“{q}”</Band></li>)}
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
    <div className="flex flex-col gap-10">
      {!result.ok && <ErrorNote focusKey={result}>{result.error}</ErrorNote>}
      {result.ok && result.message && <Band tone="muted" role="status" className="p-3 text-ink">{result.message}</Band>}

      <Section title="New business types">
        {verticals.length === 0 && <HelpEmpty id="platform.verticals.types" guideAnchor="what-this-page-tells-you" />}
        {verticals.map((v) => <VerticalCard key={v.id} v={v} targets={targets.filter((t) => t.id !== v.id)} maps={defaultMaps[v.id] ?? {}} canEdit={canEdit} formAction={formAction} busy={busy} />)}
      </Section>

      <Section title="New services">
        {areas.length === 0 && <HelpEmpty id="platform.verticals.services" guideAnchor="what-this-page-tells-you" />}
        {areas.map((a) => <AreaCard key={`${a.verticalId}/${a.id}`} a={a} siblings={(catalogue.find((c) => c.id === a.verticalId)?.services ?? []).filter((s) => s.id !== a.id)} canEdit={canEdit} formAction={formAction} busy={busy} />)}
      </Section>
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
    <Card className="gap-3 p-6">
      <h3 className="text-base font-semibold text-ink">{v.name} <span className="font-mono text-xs text-muted-ink">{v.id}</span></h3>
      <Meta createdBy={v.createdBy} clientCount={v.clientCount} extra={v.draftCostUsd !== null ? `draft cost $${v.draftCostUsd.toFixed(3)}` : undefined} />
      {v.categories.length > 0 && <div role="group" className="flex flex-wrap gap-2" aria-label="Google categories">{v.categories.map((c) => <Tag key={c}>{c}</Tag>)}</div>}
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
                  <ConfirmDialog
                    trigger={<Button type="button" aria-label={`Approve ${v.name}`} disabled={busy}>Approve</Button>}
                    title={`Approve ${v.name}?`}
                    body="It joins the business type list that every agency can choose from."
                    confirmLabel="Approve"
                    fields={{ intent: 'approve-vertical', id: v.id, label: v.name }}
                    action={(fd) => formAction(fd)}
                  />
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
    </Card>
  );
}

function EditForm({ v, formAction, busy, onDone }: { v: ReviewVertical; formAction: Shared['formAction']; busy: boolean; onDone: () => void }) {
  const d = v.detail;
  const [name, setName] = useState(v.name);
  const [noun, setNoun] = useState(d.audienceNoun);
  const [keywords, setKeywords] = useState(d.seedKeywords.join(', '));
  const [primary, setPrimary] = useState(d.primaryCategories.join(', '));
  const [related, setRelated] = useState(d.relatedCategories.join(', '));
  const [topics, setTopics] = useState(d.topics.join(', '));
  const [areaRows, setAreaRows] = useState(d.areas.map((a) => ({ ...a, aliasText: a.aliases.join(', '), keep: true })));
  const [added, setAdded] = useState('');

  // Only what changed is sent: update_vertical leaves omitted fields as they are (a topic rewrite would drop its descriptions).
  const payload = (): Record<string, unknown> => {
    const p: Record<string, unknown> = {};
    if (name.trim() !== v.name) p.name = name.trim();
    if (noun.trim() !== d.audienceNoun && noun.trim()) p.audienceNoun = noun.trim();
    if (!same(list(keywords), d.seedKeywords)) p.seedKeywords = list(keywords);
    if (!same(list(primary), d.primaryCategories)) p.categories = list(primary);
    if (!same(list(related), d.relatedCategories)) p.relatedCategories = list(related);
    if (!same(list(topics), d.topics)) p.topics = list(topics).map((t) => ({ name: t }));
    const rows = areaRows.filter((r) => r.keep).map((r) => ({ id: r.id, name: r.name.trim(), aliases: list(r.aliasText) }));
    const fresh = list(added).map((n) => ({ name: n }));
    const original = d.areas.map((a) => ({ id: a.id, name: a.name, aliases: a.aliases }));
    if (!same(rows, original) || fresh.length) p.areas = [...rows, ...fresh];
    return p;
  };
  const p = payload();
  return (
    <form action={(fd) => { formAction(fd); onDone(); }} aria-label={`Edit ${v.name}`}>
      <Band tone="muted" className="flex flex-col gap-3">
      <Post fields={{ intent: 'edit-vertical', id: v.id, label: v.name, payload: JSON.stringify(p) }}>
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1"><Label htmlFor={`e-name-${v.id}`}>Business type name</Label><Input id={`e-name-${v.id}`} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className="w-64" /></div>
          <div className="flex flex-col gap-1"><Label htmlFor={`e-noun-${v.id}`}>Audience noun</Label><Input id={`e-noun-${v.id}`} value={noun} maxLength={40} onChange={(e) => setNoun(e.target.value)} className="w-48" /></div>
        </div>
        <div className="flex flex-col gap-1"><Label htmlFor={`e-kw-${v.id}`}>Keywords (comma separated, up to 5)</Label><Input id={`e-kw-${v.id}`} value={keywords} onChange={(e) => setKeywords(e.target.value)} /></div>
        <div className="flex flex-col gap-1"><Label htmlFor={`e-cat-${v.id}`}>Google categories</Label><Input id={`e-cat-${v.id}`} value={primary} onChange={(e) => setPrimary(e.target.value)} /></div>
        <div className="flex flex-col gap-1"><Label htmlFor={`e-rel-${v.id}`}>Related Google categories</Label><Input id={`e-rel-${v.id}`} value={related} onChange={(e) => setRelated(e.target.value)} /></div>
        <div className="flex flex-col gap-1"><Label htmlFor={`e-th-${v.id}`}>Review topics (comma separated)</Label><Input id={`e-th-${v.id}`} value={topics} onChange={(e) => setTopics(e.target.value)} /></div>
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
      </Band>
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
    <Band tone="muted" role="group" aria-label={`Merge ${v.name}`} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`m-target-${v.id}`}>Merge into</Label>
          <select id={`m-target-${v.id}`} value={targetId} onChange={(e) => choose(e.target.value)} className={`${selectClass} max-w-sm`}>
            <option value="">Choose a business type</option>
            {targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        {target && v.services.length > 0 && (
          <Table>
            <TableHeader><TableRow><TableHead>Service</TableHead><TableHead>Becomes</TableHead></TableRow></TableHeader>
            <TableBody>
              {v.services.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.name}</TableCell>
                  <TableCell>
                    <select aria-label={`Where ${s.name} goes`} value={map[s.id] ?? ''} className={selectClass} onChange={(e) => setMap({ ...map, [s.id]: e.target.value || null })}>
                      <option value="">Move (keep as a new service)</option>
                      {target.services.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <div className="flex gap-2">
          <ConfirmDialog
            trigger={<Button type="button" disabled={busy || !target}>Merge</Button>}
            title={`Merge ${v.name} into ${target?.name ?? 'another business type'}?`}
            body="Agencies and clients using it move to the other business type. This cannot be undone."
            confirmLabel="Merge"
            tone="danger"
            fields={{ intent: 'merge-vertical', id: v.id, label: v.name, targetId, payload: JSON.stringify(map) }}
            action={(fd) => { formAction(fd); onDone(); }}
          />
          <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        </div>
    </Band>
  );
}

function AreaCard({ a, siblings, canEdit, formAction, busy }: { a: ReviewArea; siblings: { id: string; name: string }[]; canEdit: boolean; formAction: Shared['formAction']; busy: boolean }) {
  const [mode, setMode] = useState<Mode>('none');
  const [targetId, setTargetId] = useState('');
  return (
    <Card className="gap-3 p-6">
      <div className="text-sm text-muted-ink">{a.verticalName}</div>
      <h3 className="text-base font-semibold text-ink">{a.name} <span className="font-mono text-xs text-muted-ink">{a.id}</span></h3>
      <Meta createdBy={a.createdBy} clientCount={a.clientCount} />
      {a.aliases.length > 0 && <div role="group" className="flex flex-wrap gap-2" aria-label="Other names">{a.aliases.map((x) => <Tag key={x}>{x}</Tag>)}</div>}
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
                <ConfirmDialog
                  trigger={<Button type="button" aria-label={`Approve ${a.name}`} disabled={busy}>Approve</Button>}
                  title={`Approve ${a.name}?`}
                  body={`It joins the ${a.verticalName} service list that every agency can choose from.`}
                  confirmLabel="Approve"
                  fields={{ intent: 'approve-area', id: a.id, verticalId: a.verticalId, label: a.name }}
                  action={(fd) => formAction(fd)}
                />
              }
            />
            {mode === 'rename' && <RenameForm intent="rename-area" id={a.id} verticalId={a.verticalId} current={a.name} formAction={formAction} busy={busy} onDone={() => setMode('none')} />}
            {mode === 'merge' && (
              <Band tone="muted" role="group" aria-label={`Merge ${a.name}`} className="flex flex-wrap items-end gap-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`am-${a.verticalId}-${a.id}`}>Merge into</Label>
                  <select id={`am-${a.verticalId}-${a.id}`} value={targetId} onChange={(e) => setTargetId(e.target.value)} className={selectClass}>
                    <option value="">Choose a service</option>
                    {siblings.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <ConfirmDialog
                  trigger={<Button type="button" disabled={busy || !targetId}>Merge</Button>}
                  title={`Merge ${a.name} into ${siblings.find((x) => x.id === targetId)?.name ?? 'another service'}?`}
                  body="Clients using it move to the other service. This cannot be undone."
                  confirmLabel="Merge"
                  tone="danger"
                  fields={{ intent: 'merge-area', id: a.id, verticalId: a.verticalId, label: a.name, targetId }}
                  action={(fd) => { formAction(fd); setMode('none'); }}
                />
              </Band>
            )}
          </>
        )}
      </WriteGuard>
    </Card>
  );
}
