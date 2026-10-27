'use client';
import { Button, Label, Sheet, SheetContent, SheetTitle, SheetTrigger } from '@cs/ui';
import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { ErrorNote } from '@/components/form-error';
import { RadiusSelect, DEFAULT_RADIUS_KM } from '@/components/radius-select';
import { WriteGuard } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import { saveRankSettings } from './actions';
import { MAX_RANK_KEYWORDS, type RankSettingsView } from './scan-copy';

const INITIAL: FormResult = { ok: true };
type Settings = Pick<RankSettingsView, 'keywords' | 'allKeywords' | 'gridSize' | 'radiusKm'>;

/**
 * Phase 13b "Rank settings" (agency roles only): which keywords are scanned (up to 5 of the client's keywords), the
 * grid size and the radius. Every field is controlled and the form ignores React 19's post-action reset, so a refused
 * save keeps the choices. A save closes the sheet; its message is rendered outside the sheet, in this always-mounted
 * component, so it survives the revalidation.
 */
export function RankSettingsSheet({ clientId, settings }: { clientId: string; settings: Settings }) {
  const keywordHintId = useId();
  const [open, setOpen] = useState(false);
  const [keywords, setKeywords] = useState<string[]>(settings.keywords);
  const [grid, setGrid] = useState<5 | 7>(settings.gridSize);
  const [radius, setRadius] = useState(settings.radiusKm === null ? DEFAULT_RADIUS_KM : String(settings.radiusKm));
  const [state, action, pending] = useActionState(
    async (_p: FormResult, fd: FormData) => saveRankSettings(clientId, {
      keywords: fd.getAll('keyword').map(String), gridSize: Number(fd.get('gridSize')), radiusKm: Number(fd.get('radiusKm')),
    }),
    INITIAL,
  );
  const first = useRef(state);
  useEffect(() => {
    if (state !== first.current && state.ok) setOpen(false);
  }, [state]);

  const onOpenChange = (o: boolean) => {
    if (o) {
      // Each opening starts from the saved settings.
      setKeywords(settings.keywords);
      setGrid(settings.gridSize);
      setRadius(settings.radiusKm === null ? DEFAULT_RADIUS_KM : String(settings.radiusKm));
    }
    setOpen(o);
  };
  const toggle = (k: string, on: boolean) => setKeywords((cur) => (on ? [...cur, k] : cur.filter((x) => x !== k)));
  // Submitted in the client's keyword order.
  const chosen = settings.allKeywords.filter((k) => keywords.includes(k));
  const full = chosen.length >= MAX_RANK_KEYWORDS;
  const submitted = state !== first.current;

  return (
    <WriteGuard>
      <div className="flex flex-col items-end gap-1.5">
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetTrigger asChild>
            <Button type="button" variant="outline">Rank settings</Button>
          </SheetTrigger>
          <SheetContent side="right" aria-describedby={undefined} className="w-[360px] gap-4">
            <SheetTitle className="text-lg">Rank settings</SheetTitle>
            <form action={action} onReset={(e) => e.preventDefault()} className="flex flex-col gap-5">
              <fieldset className="flex flex-col gap-2" aria-describedby={full ? keywordHintId : undefined}>
                <legend className="mb-1 text-sm font-semibold text-ink">Keywords to scan (up to {MAX_RANK_KEYWORDS})</legend>
                {settings.allKeywords.map((k, i) => {
                  const checked = keywords.includes(k);
                  return (
                    <label key={k} htmlFor={`rank-kw-${i}`} className="flex items-center gap-2 text-sm text-ink">
                      <input id={`rank-kw-${i}`} type="checkbox" name="keyword" value={k} checked={checked} disabled={!checked && full} onChange={(e) => toggle(k, e.currentTarget.checked)} />
                      {k}
                    </label>
                  );
                })}
                {full && <p id={keywordHintId} className="text-sm text-muted-ink">That is the most keywords one scan can cover. Untick one to pick another.</p>}
              </fieldset>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-semibold text-ink">Grid</legend>
                {([5, 7] as const).map((n) => (
                  <label key={n} htmlFor={`rank-grid-${n}`} className="flex items-center gap-2 text-sm text-ink">
                    <input id={`rank-grid-${n}`} type="radio" name="gridSize" value={n} checked={grid === n} onChange={() => setGrid(n)} />
                    {`${n}×${n}`}
                  </label>
                ))}
              </fieldset>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rank-radius">Radius</Label>
                <RadiusSelect id="rank-radius" name="radiusKm" storedKm={settings.radiusKm} value={radius} onChange={(e) => setRadius(e.currentTarget.value)} />
              </div>
              {submitted && !state.ok && <ErrorNote compact focusKey={state}>{state.error}</ErrorNote>}
              <Button type="submit" disabled={pending || chosen.length === 0} className="self-start">Save settings</Button>
            </form>
          </SheetContent>
        </Sheet>
        {!open && state.ok && state.message && <p role="status" className="text-right text-sm text-ink">{state.message}</p>}
      </div>
    </WriteGuard>
  );
}
