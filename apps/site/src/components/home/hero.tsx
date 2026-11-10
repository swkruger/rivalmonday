import { ArrowDown, ArrowRight, BadgeCheck, Globe, Palette } from 'lucide-react';
import { HERO } from '../../../content/home';
import { JoinButton } from '../join/join-button';
import { JOIN_INK_CLASS } from '../join/join-classes';
import { HeroFinePrint } from './hero-fine-print';
import { HeroGallery } from './hero-gallery';
import { HeroHeadline } from './hero-headline';
import { HeroShell } from './hero-shell';
import { PilotPill } from './pilot-pill';

const PROOF_ICONS = [Globe, BadgeCheck, Palette];

/** The first screen. Server-rendered: headline, sub and the opening picture are static markup (no client fetch before LCP). */
export function Hero() {
  return (
    <HeroShell>
      <div className="relative z-10 min-w-0">
        <div className="inline-flex flex-wrap items-center gap-2 text-13 font-medium text-muted-surface">
          <PilotPill />
          <span>{HERO.eyebrow}</span>
        </div>
        <HeroHeadline headline={HERO.headline} />
        <p className="mt-6 max-w-xl text-display-sub text-muted-surface">{HERO.sub}</p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <JoinButton start={HERO.primaryStart} className={JOIN_INK_CLASS}>
            {HERO.heroCta}
            <ArrowRight aria-hidden="true" className="size-4.5" />
          </JoinButton>
          {/* One primary action per screen: the tour is the quiet outlined button (D14), not a second filled one. */}
          <a href="#client-view" className="btn-ink-ghost group hidden sm:inline-flex">
            {HERO.secondaryCta}
            <ArrowDown aria-hidden="true" className="size-4.5 transition-transform group-hover:translate-y-0.5" />
          </a>
        </div>
        <HeroFinePrint />
        <ul aria-label="Why agencies trust it" className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-surface/15 pt-5 text-13 text-muted-surface">
          {HERO.proof.map((p, i) => {
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
        <HeroGallery start="dashboard" />
      </div>
    </HeroShell>
  );
}
