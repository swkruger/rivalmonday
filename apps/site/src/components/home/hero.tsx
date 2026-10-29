import { Button } from '@cs/ui';
import { HERO } from '../../../content/home';
import { JoinButton } from '../join/join-button';
import { HeroFragments } from './hero-fragments';
import { PilotPill } from './pilot-pill';

/** The first screen. Server-rendered: headline, sub and fragments are static markup (no client fetch before LCP). */
export function Hero() {
  const lead = HERO.headline.endsWith(HERO.headlineAccent) ? HERO.headline.slice(0, -HERO.headlineAccent.length) : HERO.headline;
  return (
    <section className="bg-grid-lines relative overflow-hidden">
      <div aria-hidden="true" className="hero-wash absolute inset-x-0 top-0 h-[40rem]" />
      <div className="site-container relative grid items-center gap-12 pb-16 pt-12 lg:grid-cols-[1.05fr_1fr] lg:pb-20 lg:pt-[4.5rem]">
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
          <div className="mt-7 flex flex-wrap gap-3">
            <JoinButton>{HERO.primaryCta}</JoinButton>
            <Button asChild variant="outline">
              <a href="#sample">{HERO.secondaryCta}</a>
            </Button>
          </div>
          <p className="mt-3.5 text-13 text-ink-secondary">{HERO.finePrint}</p>
        </div>
        <div className="relative min-w-0">
          <p className="sr-only">
            Preview of a sample Monday brief. <a href="#sample">Jump to the full sample</a>
          </p>
          <HeroFragments />
        </div>
      </div>
    </section>
  );
}
