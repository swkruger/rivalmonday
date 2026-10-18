'use client';
import { Button } from '@cs/ui';
import { Loader2 } from 'lucide-react';
import { WriteGuard } from '@/components/read-only';
import type { ClientSetupView } from '../types';

const STAFF_COPY = "Finding competitors. This can take a few minutes — you can leave this page; we'll email you when suggestions are ready.";
const OWNER_COPY = 'Finding competitors. This can take a few minutes — you can leave this page and come back.';

function progressLine(search: ClientSetupView['search']): string | null {
  if (!search) return null;
  const { progress: p, status } = search;
  if ((status === 'checking' || status === 'finalising') && p.checksTotal > 0) return `Checking ads and reviews for ${p.checksTotal} businesses…`;
  if (p.searchesTotal > 0) return `Searching your area… ${p.searchesDone} of ${p.searchesTotal} searches`;
  return 'Searching your area…';
}

/**
 * Step 2. While a run is live: progress and the "you can leave" copy. When nothing ran (R1) or the last run failed:
 * "Find competitors" (and the refusal in plain words, if any) next to "Skip this step".
 */
export function SearchStep({ view, agency, pending, refusal, onStart, onSkip }: {
  view: ClientSetupView; agency: boolean; pending: boolean; refusal: string | null; onStart: () => void; onSkip: () => void;
}) {
  const status = view.state.steps.search;
  const running = status === 'running';
  const line = running ? progressLine(view.search) : null;
  return (
    <section className="flex flex-col gap-4 rounded-[14px] bg-surface p-6 shadow-card">
      {running ? (
        <>
          <p role="status" className="flex items-center gap-2 text-ink">
            <Loader2 className="animate-spin" aria-hidden />
            {agency ? STAFF_COPY : OWNER_COPY}
          </p>
          {line && <p className="rounded-lg bg-muted-surface p-3 text-ink">{line}</p>}
        </>
      ) : (
        <>
          <h2 className="font-semibold">Find competitors</h2>
          <p className="text-muted-foreground">We search Google Maps around the service area for the businesses customers compare you with.</p>
          {refusal && <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">{refusal}</p>}
        </>
      )}
      <WriteGuard>
        <div className="flex flex-wrap gap-2">
          {!running && <Button type="button" disabled={pending} onClick={onStart}>Find competitors</Button>}
          <Button type="button" variant="outline" disabled={pending} onClick={onSkip}>Skip this step</Button>
        </div>
      </WriteGuard>
    </section>
  );
}
