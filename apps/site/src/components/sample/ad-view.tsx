import { formatDay } from '../../sample/format';
import type { SampleEvidence } from '../../sample/schema';

/** The ad's copy as captured from the ad library, with when it was first seen. */
export function AdView({ ev }: { ev: Extract<SampleEvidence, { kind: 'ad' }> }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-md border border-line bg-surface p-4">
        <p className="text-sm font-semibold text-ink">{ev.headline}</p>
        <p className="text-sm text-ink-secondary">{ev.body}</p>
      </div>
      <p className="text-xs text-muted-ink">First seen {formatDay(ev.firstSeen)}</p>
    </div>
  );
}
