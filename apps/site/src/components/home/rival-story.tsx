'use client';

import { useRef, useState } from 'react';
import { BUSINESS } from '../../../content/business';
import { RIVAL_STORY, SECTIONS } from '../../../content/home';
import { rivalStoryMoves } from '../../../content/rival-story';
import { WEBSITE_MONITORING_LIVE } from '../../../content/website-monitoring';
import { rivalRanks } from '../../sample/rival-grid';
import { SAMPLE } from '../../sample/schema';
import { type OpenEvidence } from '../sample/brief-items';
import { EvidencePanel } from '../sample/evidence-panel';
import { RankGrid, type RankGridSubject } from '../sample/rank-grid';
import { HomeSectionShell, SectionHeading } from './section-heading';

const DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** "2026-10-07" -> "Oct 7", the same in every timezone. */
function shortDay(iso: string): string {
  return DAY.format(new Date(`${iso}T00:00:00Z`));
}

/** The replay shows the rival's own map (spec D13): fictional sample data, the client's point stays ringed. */
const RIVAL_SUBJECT: RankGridSubject = { title: RIVAL_STORY.gridTitle(SAMPLE.rankGrid.keyword), ranks: rivalRanks, tone: 'rival' };

/**
 * §2, the page's one showpiece: the sample rival's map-rank replay beside a dated log of the rival's moves.
 * Every log row opens the same evidence sheet the grid does.
 */
export function RivalStory({ audience = 'agency' }: { audience?: 'agency' | 'business' } = {}) {
  const live = WEBSITE_MONITORING_LIVE;
  const [openId, setOpenId] = useState<string | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const open: OpenEvidence = (id, el) => {
    trigger.current = el;
    setOpenId(id);
  };
  const business = audience === 'business';
  const section = business ? { ...SECTIONS['rival-story'], heading: BUSINESS.rivalStory.heading } : SECTIONS['rival-story'];
  return (
    <HomeSectionShell id="rival-story" labelledBy="rival-story-heading" className="bg-surface">
      {/* Phones read heading → replay → log; from `lg` the replay spans both rows on the left. */}
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:grid-rows-[auto_1fr] lg:gap-x-14 lg:gap-y-8">
        <div className="min-w-0 lg:col-start-2 lg:row-start-1">
          <SectionHeading section={section} body={false} />
          {business && <p className="mt-4 max-w-2xl text-lg text-ink-secondary">{BUSINESS.rivalStory.intro}</p>}
          <p className="mt-4 max-w-2xl text-lg text-ink-secondary">{live ? section.body : RIVAL_STORY.bodyNoWeb}</p>
        </div>
        <div className="min-w-0 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <RankGrid data={SAMPLE} onOpen={open} howHref="/sources/local-map-rankings" subject={RIVAL_SUBJECT} />
        </div>
        <div className="min-w-0 lg:col-start-2 lg:row-start-2">
          <h3 id="rival-story-log" className="text-base font-semibold text-ink">{RIVAL_STORY.logHeading}</h3>
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
          <p className="mt-6 max-w-2xl text-base font-medium text-ink">{business ? BUSINESS.rivalStory.closing : RIVAL_STORY.closing}</p>
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
