'use client';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Input, Label, nativeSelectClass, textareaClass } from '@cs/ui';
import Link from 'next/link';
import { useId, useRef, useState, useTransition } from 'react';
import { useReadOnly } from '@/components/read-only';
import type { ToolResult } from '@/server/run-tool';
import { plainAnswer } from './answer';
import { ErrorNote } from '@/components/form-error';

type Level = 'L' | 'M' | 'H';
export type SaveRecommendationInput = { clientId: string; title: string; rationale: string; effort: Level; impact?: Level; evidenceIds: string[] };
export type SaveRecommendationAction = (input: SaveRecommendationInput) => Promise<ToolResult<{ id: string }>>;

/** `add_recommendation`'s limits (the server action re-checks them). */
export const TITLE_MIN = 3;
export const TITLE_MAX = 120;
export const RATIONALE_MIN = 10;
export const RATIONALE_MAX = 1000;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** The dialog's prefill from an answer: title = its first sentence, rationale = the whole answer, both without markers. */
export function savePrefill(content: string): { title: string; rationale: string } {
  const text = plainAnswer(content).replace(/\s+/g, ' ').trim();
  const first = /^(.+?[.!?])(?:\s|$)/.exec(text)?.[1] ?? text;
  return { title: clip(first.replace(/[.!?]+$/, ''), TITLE_MAX), rationale: clip(text, RATIONALE_MAX) };
}

/**
 * "Save as recommendation" (spec "Web"): `add_recommendation` on the `ask` channel via `saveAskRecommendation`.
 * The success line lives outside the dialog so it survives the dialog closing.
 */
export function SaveRecommendationDialog({
  clientId, evidenceIds, defaultTitle, defaultRationale, saveAction, triggerLabel = 'Save as recommendation', triggerSize = 'sm',
}: {
  clientId: string;
  evidenceIds: string[];
  defaultTitle: string;
  defaultRationale: string;
  saveAction: SaveRecommendationAction;
  triggerLabel?: string;
  /** The trigger's button size: `sm` inside an answer, `default` beside other page-level controls. */
  triggerSize?: 'sm' | 'default';
}) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [rationale, setRationale] = useState(defaultRationale);
  const [effort, setEffort] = useState<Level>('M');
  const [impact, setImpact] = useState<Level>('M');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  // Blocks a second submit while one is in flight (set before `pending` flips).
  const inFlight = useRef(false);
  const readOnly = useReadOnly();
  if (readOnly || evidenceIds.length === 0) return null;
  // Saved once: the trigger is not offered again; only the status line stays.
  if (saved) return <SavedLine clientId={clientId} />;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    start(async () => {
      setError(null);
      try {
        const r = await saveAction({ clientId, title: title.trim(), rationale: rationale.trim(), effort, impact, evidenceIds });
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setSaved(true);
        setOpen(false);
      } finally {
        inFlight.current = false;
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size={triggerSize}>
            {triggerLabel}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as recommendation</DialogTitle>
            <DialogDescription>It is added to Recommendations with the evidence this answer cites.</DialogDescription>
          </DialogHeader>
          {error && (
            <ErrorNote>
              {error}
            </ErrorNote>
          )}
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${uid}-title`}>Title</Label>
              <Input id={`${uid}-title`} value={title} onChange={(e) => setTitle(e.target.value)} required minLength={TITLE_MIN} maxLength={TITLE_MAX} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${uid}-rationale`}>Why</Label>
              <textarea id={`${uid}-rationale`} value={rationale} onChange={(e) => setRationale(e.target.value)} required minLength={RATIONALE_MIN} maxLength={RATIONALE_MAX} className={textareaClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${uid}-effort`}>Effort</Label>
                <select id={`${uid}-effort`} value={effort} onChange={(e) => setEffort(e.target.value as Level)} className={`${nativeSelectClass} w-full`}>
                  <option value="L">Low</option>
                  <option value="M">Medium</option>
                  <option value="H">High</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${uid}-impact`}>Impact</Label>
                <select id={`${uid}-impact`} value={impact} onChange={(e) => setImpact(e.target.value as Level)} className={`${nativeSelectClass} w-full`}>
                  <option value="L">Low</option>
                  <option value="M">Medium</option>
                  <option value="H">High</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {evidenceIds.length === 1 ? '1 evidence item attached.' : `${evidenceIds.length} evidence items attached.`}
            </p>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SavedLine({ clientId }: { clientId: string }) {
  return (
    <p role="status" className="text-xs text-muted-foreground">
      Saved to{' '}
      <Link href={`/c/${clientId}/recommendations`} className="font-medium text-primary-soft-text hover:underline">
        Recommendations
      </Link>
      .
    </p>
  );
}
