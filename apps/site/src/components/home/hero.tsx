import { ArrowDown, ArrowRight, BadgeCheck, Globe, Palette } from 'lucide-react';
import { HERO, HOME_IMAGES } from '../../../content/home';
import { RadarRings } from '../motion/radar-rings';
import { JoinButton } from '../join/join-button';
import { JOIN_INK_CLASS } from '../join/join-classes';
import { SAMPLE_MAP_SRC } from '../sample/rank-map';
import { HeroFinePrint } from './hero-fine-print';
import { HeroHeadline } from './hero-headline';
import { PilotPill } from './pilot-pill';

const PROOF_ICONS = [Globe, BadgeCheck, Palette];
const SHOT = 'rounded-frame shadow-frame ring-1 ring-surface/15';

/** Faint rings only, behind the copy and the screenshots. Decorative, never clickable. */
function Radar() {
  return (
    <div aria-hidden="true" className="radar -right-64 -top-30 size-275 opacity-55 max-lg:-right-150">
      <RadarRings className="absolute inset-0 size-full stroke-primary" />
    </div>
  );
}

/** The first screen. Server-rendered: headline, sub and image are static markup (no client fetch before LCP). */
export function Hero() {
  return (
    <section data-slot="hero" className="relative overflow-hidden bg-ink">
      <img src={SAMPLE_MAP_SRC} alt="" width={960} height={960} decoding="async" className="night-map pointer-events-none absolute inset-0 size-full" />
      <div aria-hidden="true" className="night-veil absolute inset-0" />
      <Radar />
      <div className="site-container relative grid items-center gap-12 pb-16 pt-9 sm:pt-14 lg:grid-cols-[1.02fr_1fr] lg:pb-24 lg:pt-20">
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
