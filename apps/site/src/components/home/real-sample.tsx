'use client';

import { Lock, Mail } from 'lucide-react';
import { CLIENT_VIEW } from '../../../content/client-view';
import { REAL_SAMPLE_PREVIEW, SECTIONS } from '../../../content/home';
import { SAMPLE } from '../../sample/schema';
import { JoinButton } from '../join/join-button';
import { Reveal } from '../motion/in-view';
import { weekStats } from '../sample/rank-map';
import { usePilot } from '../shell/pilot-context';
import { HomeSectionShell, SectionHeading } from './section-heading';

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

/** Pilot only: the real sample is requested through the pilot popup, so the section goes when the pilot is off. */
export function RealSample() {
  const { pilotMode } = usePilot();
  if (!pilotMode) return null;
  return (
    <HomeSectionShell id="real-sample" labelledBy="real-sample-heading">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:gap-16">
        <div className="flex flex-col items-start gap-6">
          <SectionHeading section={SECTIONS['real-sample']} />
          <JoinButton start="agency-sample">Get a real brief for one client</JoinButton>
        </div>
        <Reveal>
          {/* Illustrative: what lands in the inbox when the sample is ready. Decorative; the copy beside it says it all. */}
          <figure aria-hidden="true" className="rounded-lg border border-line bg-surface p-5 shadow-float transition-transform duration-300 lg:rotate-1 lg:hover:rotate-0">
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
            <dl className="mt-2 flex flex-col divide-y divide-line rounded-md border border-line">
              {scorecard().map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-3 px-3 py-2 text-13">
                  <dt className="text-ink-secondary">{row.label}</dt>
                  <dd className="text-right font-semibold tabular-nums text-ink">{row.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 flex items-center gap-1.5 text-13 font-medium text-link">
              <Lock className="size-3.5" />
              {REAL_SAMPLE_PREVIEW.link}
            </p>
            <figcaption className="mt-3 text-xs text-muted-ink">{REAL_SAMPLE_PREVIEW.note}</figcaption>
          </figure>
        </Reveal>
      </div>
    </HomeSectionShell>
  );
}
