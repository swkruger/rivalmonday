import { ArrowDown, BadgeCheck, Globe, Palette } from 'lucide-react';
import { HERO } from '../../../content/home';
import { JoinButton } from '../join/join-button';
import { HeroFinePrint } from './hero-fine-print';
import { HeroFragments } from './hero-fragments';
import { PilotPill } from './pilot-pill';

const PROOF_ICONS = [Globe, BadgeCheck, Palette];

/** The first screen. Server-rendered: headline, sub and fragments are static markup (no client fetch before LCP). */
export function Hero() {
  const lead = HERO.headline.endsWith(HERO.headlineAccent) ? HERO.headline.slice(0, -HERO.headlineAccent.length) : HERO.headline;
  return (
    <section className="bg-grid-lines relative overflow-hidden">
      <div aria-hidden="true" className="hero-wash absolute inset-x-0 top-0 h-[40rem]" />
      <div className="site-container relative grid items-center gap-12 pb-16 pt-12 lg:grid-cols-[1.05fr_1fr] lg:pb-20 lg:pt-16">
        <div className="relative z-10 min-w-0">
          <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1.5 pr-3 text-13 font-medium text-secondary">
            <PilotPill />
            <span>{HERO.eyebrow}</span>
          </div>
          <h1 className="mt-5 text-display font-semibold text-ink">
            {lead}
            <span data-accent className="text-secondary">{HERO.headlineAccent}</span>
          </h1>
          <p className="mt-4 max-w-xl text-display-sub text-ink-secondary">{HERO.sub}</p>
          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
            <JoinButton>{HERO.primaryCta}</JoinButton>
            {/* One primary action per screen: the tour is a quiet text link, not a second button. */}
            <a href="#client-view" className="group inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-link hover:underline">
              {HERO.secondaryCta}
              <ArrowDown aria-hidden="true" className="size-4 transition-transform group-hover:translate-y-0.5" />
            </a>
          </div>
          <HeroFinePrint />
          <ul aria-label="Why agencies trust it" className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-5 text-13 text-ink-secondary">
            {HERO.proof.map((p, i) => {
              const Icon = PROOF_ICONS[i] ?? BadgeCheck;
              return (
                <li key={p} className="flex items-center gap-1.5">
                  <Icon aria-hidden="true" className="size-4 text-secondary" />
                  {p}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="relative min-w-0">
          <p className="sr-only">Preview of a sample Monday brief.</p>
          {/* Visible when focused, so a keyboard user sees where the tab stop is. */}
          <a
            href="#sample"
            className="sr-only focus:not-sr-only focus:absolute focus:left-0 focus:top-0 focus:z-20 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-link focus:shadow-float"
          >
            Jump to the full sample
          </a>
          <HeroFragments />
        </div>
      </div>
    </section>
  );
}
