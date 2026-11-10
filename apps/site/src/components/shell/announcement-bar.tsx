'use client';

import { ANNOUNCEMENT } from '../../../content/home';
import { useJoin } from '../join/join-provider';
import { usePilot } from './pilot-context';
import { useSide } from './side-context';

/** Pilot-only strip above the header: one fixed sentence and its join link. Nothing moves. */
export function AnnouncementBar() {
  const { pilotMode } = usePilot();
  const { open } = useJoin();
  const side = useSide();

  if (!pilotMode) return null;
  const { text, link } = ANNOUNCEMENT[side === 'both' ? 'home' : side];

  return (
    <div data-slot="announcement-bar" role="region" aria-label="Announcement" className="border-b border-line bg-muted-surface text-13 text-ink">
      <div className="site-container flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 py-2 text-center">
        <p className="min-w-0">{text}</p>
        {link && (
          <button type="button" onClick={() => open(link.start)} className="font-semibold text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            {link.label}
          </button>
        )}
      </div>
    </div>
  );
}
