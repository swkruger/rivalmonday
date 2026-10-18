'use client';
import { Button, Input, Label } from '@cs/ui';
import { useState, useTransition } from 'react';
import type { createVerticalAction, draftVerticalAction } from '@/app/(app)/agency/clients/new/vertical-actions';
import { ErrorNote } from '@/components/form-error';
import { MAX_KEYWORDS, type NewTypeForm, canCreate, formFromDraft, manualForm, toCreateInput } from '@/components/new-business-type-model';
import { WriteGuard } from '@/components/read-only';
import type { VerticalOption } from '@/server/verticals';

/** The two server actions the panel needs, passed in by the page (keeps the panel testable without server modules). */
export interface VerticalActions {
  draft: typeof draftVerticalAction;
  create: typeof createVerticalAction;
}

/** The vertical select's options plus any added at runtime (a just-created type, or a "did you mean" match missing from the list). */
export function useVerticalChoice(verticals: VerticalOption[], initialId: string) {
  const [extra, setExtra] = useState<VerticalOption[]>([]);
  const [value, setValue] = useState(initialId);
  const options = [...verticals, ...extra.filter((e) => !verticals.some((v) => v.id === e.id))];
  const choose = (id: string, name?: string) => {
    if (name && !options.some((o) => o.id === id)) setExtra((x) => [...x, { id, name, services: [] }]);
    setValue(id);
  };
  return { options, value, choose };
}

type Phase = 'idle' | 'edit' | 'created';

const chipBase = 'inline-flex items-center gap-1.5 rounded-full bg-muted-surface px-3 py-1 text-sm font-semibold text-ink';

function RemovableChip({ label, quote, onRemove }: { label: string; quote?: string; onRemove: () => void }) {
  return (
    <span title={quote ? `From Google: “${quote}”` : undefined} className={chipBase}>
      {label}
      <button type="button" aria-label={`Remove ${label}`} onClick={onRemove} className="text-muted-ink hover:text-ink">×</button>
    </span>
  );
}

function AddInput({ id, label, disabled, onAdd }: { id: string; label: string; disabled?: boolean; onAdd: (v: string) => void }) {
  const [v, setV] = useState('');
  const add = () => {
    const t = v.trim();
    if (t.length >= 2) onAdd(t);
    setV('');
  };
  return (
    <div className="flex items-center gap-2">
      <Input id={id} aria-label={label} value={v} disabled={disabled} maxLength={80} placeholder={label} className="h-8 w-48"
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={add}>Add</Button>
    </div>
  );
}

/**
 * Shown when the picked Google place matches no business type. Draft (AI, quote-checked) -> edit -> create; a created type
 * is handed to `onCreated`, which selects it so the normal add-client / accept-lead flow continues. Never nested in a form.
 */
export function NewBusinessType({ place, actions, onSelect, onCreated }: {
  place: { placeId: string; category: string | null };
  actions: VerticalActions;
  /** "Did you mean" chip: pick an existing type. */
  onSelect: (id: string, name: string) => void;
  onCreated: (id: string, name: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [similar, setSimilar] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState<NewTypeForm | null>(null);
  const [fromDraft, setFromDraft] = useState(false);
  const [done, setDone] = useState<{ name: string; dropped: string[] } | null>(null);

  const fail = (msg: string) => { setError(msg); setAttempt((n) => n + 1); };

  const draft = () => {
    setError(null);
    start(async () => {
      const r = await actions.draft({ placeId: place.placeId, category: place.category });
      if (!r.ok) return fail(r.error);
      setSimilar(r.similar);
      setFromDraft(r.draft !== null);
      setForm(r.draft ? formFromDraft(r.draft) : manualForm(place.category));
      setPhase('edit');
    });
  };

  const create = () => {
    if (!form) return;
    setError(null);
    start(async () => {
      const r = await actions.create(toCreateInput(form, fromDraft ? place.placeId : null));
      if (!r.ok) return fail(r.error);
      setDone({ name: r.name, dropped: r.droppedCategories });
      setPhase('created');
      onCreated(r.verticalId, r.name);
    });
  };

  const patch = (p: Partial<NewTypeForm>) => setForm((f) => (f ? { ...f, ...p } : f));

  if (phase === 'created' && done) {
    return (
      <div role="status" className="flex flex-col gap-1 rounded-lg bg-muted-surface p-3 text-sm text-ink">
        <p>Created {done.name}. Our team reviews new business types; you can use it now.</p>
        {done.dropped.length > 0 && <p className="text-muted-ink">Left out {done.dropped.join(', ')}: already used by another business type.</p>}
      </div>
    );
  }

  return (
    <WriteGuard>
      <section aria-label="New business type" className="flex flex-col gap-4 rounded-[14px] bg-surface p-6 shadow-card">
        <div>
          <h2 className="text-base font-bold">We don’t track this business type yet</h2>
          {phase === 'idle' && <p className="mt-1 text-sm text-muted-ink">We can draft it from the Google profile. You review it before anything is saved.</p>}
        </div>
        {error && <ErrorNote focusKey={attempt}>{error}</ErrorNote>}

        {phase === 'idle' && (
          <Button type="button" onClick={draft} disabled={pending} className="self-start">
            {pending ? 'Drafting from the Google profile…' : 'Draft it'}
          </Button>
        )}

        {phase === 'edit' && form && (
          <>
            {similar.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {similar.map((s) => (
                  <button key={s.id} type="button" onClick={() => onSelect(s.id, s.name)} className="rounded-full bg-primary-soft px-3 py-1 text-sm font-semibold text-primary-soft-text">
                    Did you mean {s.name}?
                  </button>
                ))}
              </div>
            )}
            {!fromDraft && <p className="text-sm text-muted-ink">We couldn’t draft this business type. Enter a name and its main services.</p>}
            <div className="flex flex-wrap gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="nbt-name">Business type name</Label>
                <Input id="nbt-name" value={form.name} maxLength={60} onChange={(e) => patch({ name: e.target.value })} className="w-64" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="nbt-noun">Audience noun</Label>
                <Input id="nbt-noun" value={form.audienceNoun} maxLength={40} placeholder="e.g. customers" onChange={(e) => patch({ audienceNoun: e.target.value })} className="w-48" />
              </div>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold">Main services</legend>
              <div className="flex flex-wrap gap-2">
                {form.areas.map((a, i) => (
                  <RemovableChip key={`${a.name}-${i}`} label={a.name} quote={a.quote} onRemove={() => patch({ areas: form.areas.filter((_, j) => j !== i) })} />
                ))}
              </div>
              {form.areas.length < 20 && <AddInput id="nbt-add-area" label="Add a service" onAdd={(v) => patch({ areas: [...form.areas, { name: v, aliases: [] }] })} />}
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold">Keywords</legend>
              <div className="flex flex-wrap gap-2">
                {form.keywords.map((k, i) => (
                  <RemovableChip key={`${k.value}-${i}`} label={k.value} quote={k.quote} onRemove={() => patch({ keywords: form.keywords.filter((_, j) => j !== i) })} />
                ))}
              </div>
              {form.keywords.length < MAX_KEYWORDS && <AddInput id="nbt-add-keyword" label="Add a keyword" onAdd={(v) => patch({ keywords: [...form.keywords, { value: v }] })} />}
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold">Google categories</legend>
              {form.categories.map((c, i) => (
                <label key={c.value} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={c.checked} className="h-4 w-4"
                    onChange={() => patch({ categories: form.categories.map((x, j) => (j === i ? { ...x, checked: !x.checked } : x)) })} />
                  {c.value}
                </label>
              ))}
            </fieldset>

            <Button type="button" onClick={create} disabled={pending || !canCreate(form)} className="self-start">Create business type</Button>
          </>
        )}
      </section>
    </WriteGuard>
  );
}
