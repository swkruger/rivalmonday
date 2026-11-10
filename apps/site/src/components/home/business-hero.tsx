'use client';

import { ArrowDown, ArrowRight, BadgeCheck, Globe, Users } from 'lucide-react';
import { BUSINESS } from '../../../content/business';
import { JoinButton } from '../join/join-button';
import { JOIN_INK_CLASS } from '../join/join-classes';
import { usePilot } from '../shell/pilot-context';
import { HeroGallery } from './hero-gallery';
import { HeroHeadline } from './hero-headline';
import { HeroShell } from './hero-shell';

const PROOF_ICONS = [Globe, BadgeCheck, Users];

/** `/business`'s first screen: the waitlist button, a sample-brief link, the fine print by pilot mode. No pilot pill, no sign-up. */
export function BusinessHero() {
  const { pilotMode } = usePilot();
  const { hero } = BUSINESS;
  return (
    <HeroShell>
      <div className="relative z-10 min-w-0">
        <p className="text-13 font-medium text-muted-surface">{hero.eyebrow}</p>
        <HeroHeadline headline={hero.headline} />
        <p className="mt-6 max-w-xl text-display-sub text-muted-surface">{hero.sub}</p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <JoinButton start="business" className={JOIN_INK_CLASS}>
            {hero.primaryCta}
            <ArrowRight aria-hidden="true" className="size-4.5" />
          </JoinButton>
          <a href="#sample" className="btn-ink-ghost group hidden sm:inline-flex">
            {hero.secondaryCta}
            <ArrowDown aria-hidden="true" className="size-4.5 transition-transform group-hover:translate-y-0.5" />
          </a>
        </div>
        <p className="mt-3.5 text-13 text-surface">{pilotMode ? hero.finePrint : hero.finePrintTrial}</p>
        <ul aria-label="Why trust it" className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-surface/15 pt-5 text-13 text-muted-surface">
          {hero.proof.map((p, i) => {
            const Icon = PROOF_ICONS[i] ?? BadgeCheck;
            return (
              <li key={p} className="flex items-center gap-1.5">
                <Icon aria-hidden="true" className="size-4 text-primary" />
                {p}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="min-w-0">
        <HeroGallery start="brief" />
      </div>
    </HeroShell>
  );
}
