import { ArrowDown, BadgeCheck, Globe, Palette } from 'lucide-react';
import { HERO, HOME_IMAGES } from '../../../content/home';
import { JoinButton } from '../join/join-button';
import { SAMPLE_MAP_SRC } from '../sample/rank-map';
import { HeroFinePrint } from './hero-fine-print';
import { PilotPill } from './pilot-pill';

const PROOF_ICONS = [Globe, BadgeCheck, Palette];
const SHOT = 'rounded-lg shadow-float ring-1 ring-surface/15';

/** The first screen. Server-rendered: headline, sub and image are static markup (no client fetch before LCP). */
export function Hero() {
  return (
    <section data-slot="hero" className="relative overflow-hidden bg-ink">
      <img src={SAMPLE_MAP_SRC} alt="" width={960} height={960} decoding="async" className="night-map pointer-events-none absolute inset-0 size-full" />
      <div aria-hidden="true" className="night-veil absolute inset-0" />
      <div className="site-container relative grid items-center gap-12 pb-16 pt-14 lg:grid-cols-[1.02fr_1fr] lg:pb-24 lg:pt-20">
        <div className="relative z-10 min-w-0">
          <div className="inline-flex flex-wrap items-center gap-2 text-13 font-medium text-muted-surface">
            <PilotPill />
            <span>{HERO.eyebrow}</span>
          </div>
          <h1 className="mt-6 text-balance text-display font-semibold text-surface">{HERO.headline}</h1>
          <p className="mt-6 max-w-xl text-display-sub text-muted-surface">{HERO.sub}</p>
          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
            <JoinButton>{HERO.primaryCta}</JoinButton>
            {/* One primary action per screen: the tour is a quiet text link, not a second button. */}
            <a href="#client-view" className="group inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-surface hover:underline">
              {HERO.secondaryCta}
              <ArrowDown aria-hidden="true" className="size-4 transition-transform group-hover:translate-y-0.5" />
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
          {/* One dominant window, two smaller views over its lower corners. Phones get the dashboard alone: the rest would be unreadable. */}
          <div className="relative mx-auto max-w-2xl sm:aspect-square">
            <img src={HOME_IMAGES.hero.src} alt={HOME_IMAGES.hero.alt} width={860} height={474} decoding="async" fetchPriority="high" className={`${SHOT} w-full sm:absolute sm:right-0 sm:top-0 sm:w-9/10`} />
            <img src={HOME_IMAGES.heroMap.src} alt={HOME_IMAGES.heroMap.alt} width={480} height={560} decoding="async" className={`${SHOT} absolute left-0 top-1/2 hidden w-9/25 sm:block`} />
            <img src={HOME_IMAGES.heroFriday.src} alt={HOME_IMAGES.heroFriday.alt} width={620} height={481} decoding="async" className={`${SHOT} absolute bottom-0 right-0 hidden w-5/8 sm:block`} />
          </div>
          <p className="mx-auto mt-3 max-w-2xl text-13 text-muted-surface">{HOME_IMAGES.hero.caption}</p>
        </div>
      </div>
    </section>
  );
}
