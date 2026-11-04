'use client';

import { useRef, useState } from 'react';
import { RIVAL_STORY, rivalStoryMoves, SECTIONS } from '../../../content/home';
import { WEBSITE_MONITORING_LIVE } from '../../../content/website-monitoring';
import { SAMPLE } from '../../sample/schema';
import { type OpenEvidence } from '../sample/brief-items';
import { EvidencePanel } from '../sample/evidence-panel';
import { RankGrid } from '../sample/rank-grid';
import { HomeSectionShell, SectionHeading } from './section-heading';

const DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** "2026-10-07" -> "Oct 7", the same in every timezone. */
function shortDay(iso: string): string {
  return DAY.format(new Date(`${iso}T00:00:00Z`));
}

/**
 * §2, the page's one showpiece: the sample map-rank replay beside a dated log of the rival's moves.
 * Every log row opens the same evidence sheet the grid does.
 */
export function RivalStory() {
  const live = WEBSITE_MONITORING_LIVE;
  const [openId, setOpenId] = useState<string | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const open: OpenEvidence = (id, el) => {
    trigger.current = el;
    setOpenId(id);
  };
  const section = SECTIONS['rival-story'];
  return (
    <HomeSectionShell id="rival-story" labelledBy="rival-story-heading" className="bg-surface py-20 lg:py-28">
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14">
        <div className="min-w-0">
          <RankGrid data={SAMPLE} onOpen={open} howHref="/sources/local-map-rankings" />
        </div>
        <div className="min-w-0">
          <SectionHeading section={section} body={false} />
          <p className="mt-4 max-w-2xl text-lg text-ink-secondary">{live ? section.body : RIVAL_STORY.bodyNoWeb}</p>
          <h3 id="rival-story-log" className="mt-8 text-base font-semibold text-ink">{RIVAL_STORY.logHeading}</h3>
          <ol aria-labelledby="rival-story-log" className="mt-3 divide-y divide-line border-y border-line">
            {rivalStoryMoves(live).map((m) => (
              <li key={m.evidence} className="flex items-baseline gap-4 py-3">
                <time dateTime={m.date} className="w-14 shrink-0 text-13 tabular-nums text-muted-ink">
                  {shortDay(m.date)}
                </time>
                <button type="button" onClick={(e) => open(m.evidence, e.currentTarget)} className="text-left text-base text-ink underline-offset-4 hover:underline">
                  {m.title}
                </button>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-13 text-muted-ink">{RIVAL_STORY.caption}</p>
          <p className="mt-6 max-w-2xl text-base font-medium text-ink">{RIVAL_STORY.closing}</p>
        </div>
      </div>
      <EvidencePanel
        ev={openId ? SAMPLE.evidence[openId] ?? null : null}
        data={SAMPLE}
        onClose={() => setOpenId(null)}
        returnFocus={() => trigger.current}
      />
    </HomeSectionShell>
  );
}
