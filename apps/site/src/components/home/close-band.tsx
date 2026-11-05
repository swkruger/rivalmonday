'use client';

import { ArrowRight, Lock, Mail } from 'lucide-react';
import { CLIENT_VIEW } from '../../../content/client-view';
import { CLOSE, CLOSE_TRIAL, HERO, REAL_SAMPLE_PREVIEW } from '../../../content/home';
import { SAMPLE } from '../../sample/schema';
import { JoinButton } from '../join/join-button';
import { JOIN_INK_CLASS } from '../join/join-classes';
import { Reveal } from '../motion/in-view';
import { weekStats } from '../sample/rank-map';
import { usePilot } from '../shell/pilot-context';
import { InkBand } from './cta-band';
import { FounderNote } from './founder-note';

/** "Where you stand" rows for the preview, all from the fictional sample. */
function scorecard() {
  const latest = weekStats(SAMPLE.rankGrid.weeks.at(-1)!.you);
  const rating = CLIENT_VIEW.kpis.find((k) => k.label === 'Your rating vs area');
  const top = SAMPLE.rivals.filter((r) => r.tier === 'top').length;
  return [
    { label: 'Map top 3', value: `${latest.top3} of ${latest.points} points` },
    ...(rating ? [{ label: 'Google rating', value: `${rating.value.toFixed(1)} · ${rating.caption}` }] : []),
    { label: 'Rivals found', value: `${SAMPLE.rivals.length}, ${top} of them top rivals` },
  ];
}

/** Section 11: the page's closing ink band (`#join`). The copy asks once; the illustrative preview sits beside it from `lg`. */
export function CloseBand() {
  const { pilotMode } = usePilot();
  const copy = pilotMode ? CLOSE : CLOSE_TRIAL;
  return (
    <>
      <InkBand id="join" labelledBy="close-heading">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:gap-16">
          <div className="flex flex-col items-center lg:items-start lg:text-left">
            <h2 id="close-heading" className="text-section font-semibold text-surface">{copy.heading}</h2>
            <p className="mt-4 max-w-xl text-lg text-muted-surface">{copy.body}</p>
            <div className="mt-7">
              <JoinButton start={HERO.primaryStart} className={JOIN_INK_CLASS}>
                {copy.button}
                <ArrowRight aria-hidden="true" className="size-4.5" />
              </JoinButton>
            </div>
            <p className="mt-4 text-13 text-surface">{pilotMode ? HERO.finePrint : HERO.finePrintTrial}</p>
          </div>
          <Reveal>
            {/* Illustrative: what lands in the inbox when the sample is ready. Decorative; the copy beside it says it all. */}
            <figure aria-hidden="true" className="product-frame border border-line bg-surface p-5 text-left transition-transform duration-300 lg:rotate-1 lg:hover:rotate-0">
              <div className="frame-chrome -mx-5 -mt-5 mb-5">
                <span className="frame-chrome-dot" />
                <span className="frame-chrome-dot" />
                <span className="frame-chrome-dot" />
              </div>
              <div className="flex items-start gap-3 border-b border-line pb-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-soft-text">
                  <Mail className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{REAL_SAMPLE_PREVIEW.subject}</p>
                  <p className="truncate text-xs text-ink-secondary">{SAMPLE.business.name}</p>
                </div>
              </div>
              <p className="mt-4 text-13 font-semibold text-ink">{REAL_SAMPLE_PREVIEW.scorecardTitle}</p>
              <dl className="mt-2 flex flex-col divide-y divide-line rounded-lg bg-canvas">
                {scorecard().map((row) => (
                  <div key={row.label} className="flex items-baseline justify-between gap-3 px-3 py-2 text-13">
                    <dt className="text-ink-secondary">{row.label}</dt>
                    <dd className="text-right font-semibold tabular-nums text-ink">{row.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-ink">
                <Lock className="size-3.5" />
                {REAL_SAMPLE_PREVIEW.link}
              </p>
              <figcaption className="mt-3 text-xs text-muted-ink">{REAL_SAMPLE_PREVIEW.note}</figcaption>
            </figure>
          </Reveal>
        </div>
      </InkBand>
      <FounderNote />
    </>
  );
}
