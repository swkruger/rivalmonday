import { ArrowDown, ArrowRight, BadgeCheck, Globe, Palette } from 'lucide-react';
import { HERO, HOME_IMAGES } from '../../../content/home';
import { WEBSITE_MONITORING_LIVE } from '../../../content/website-monitoring';
import { JOIN_INK_CLASS, JoinButton } from '../join/join-button';
import { SAMPLE_MAP_SRC } from '../sample/rank-map';
import { HeroFinePrint } from './hero-fine-print';
import { PilotPill } from './pilot-pill';

const PROOF_ICONS = [Globe, BadgeCheck, Palette];
const SHOT = 'rounded-frame shadow-frame ring-1 ring-surface/15';

/** The headline split before its last word, which gets the canvas's hand-drawn amber underline (spec D14). Text unchanged. */
const LAST_SPACE = HERO.headline.lastIndexOf(' ');
const HEAD = HERO.headline.slice(0, LAST_SPACE + 1);
const LAST_WORD = HERO.headline.slice(LAST_SPACE + 1);

/** Blip positions on the 1100 px radar (canvas D14), placed where the screenshots leave the band open; staggered pulses. */
const BLIPS = [
  { left: 404, top: 180, delay: '0s' },
  { left: 140, top: 500, delay: '.8s' },
  { left: 430, top: 880, delay: '1.6s' },
];

/** Hero-only ambient motion (D14): a slow radar sweep over faint rings, three amber blips (from `lg`: on phones they would sit on the copy). Gone under reduced motion (site.css). */
function Radar() {
  return (
    <div aria-hidden="true" className="radar -right-64 -top-30 size-275 max-lg:-right-150 max-lg:opacity-50">
      <div className="radar-sweep" />
      <svg viewBox="0 0 1100 1100" fill="none" className="absolute inset-0 size-full stroke-primary opacity-60">
        <circle cx="550" cy="550" r="140" strokeOpacity=".30" />
        <circle cx="550" cy="550" r="260" strokeOpacity=".22" />
        <circle cx="550" cy="550" r="380" strokeOpacity=".15" />
        <circle cx="550" cy="550" r="500" strokeOpacity=".09" />
        <path d="M550 50v1000M50 550h1000" strokeOpacity=".09" />
      </svg>
      {BLIPS.map((b) => (
        <span key={b.left} className="radar-blip max-lg:hidden" style={{ left: b.left, top: b.top, animationDelay: b.delay }} />
      ))}
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
      <div className="site-container relative grid items-center gap-12 pb-16 pt-14 lg:grid-cols-[1.02fr_1fr] lg:pb-24 lg:pt-20">
        <div className="relative z-10 min-w-0">
          <div className="inline-flex flex-wrap items-center gap-2 text-13 font-medium text-muted-surface">
            <PilotPill />
            <span>{HERO.eyebrow}</span>
          </div>
          <h1 className="mt-6 text-balance text-display font-bold text-surface">
            {HEAD}
            <span className="relative inline-block whitespace-nowrap text-amber">
              {LAST_WORD}
              <svg aria-hidden="true" viewBox="0 0 300 18" preserveAspectRatio="none" fill="none" className="absolute -bottom-[0.12em] left-[2%] h-[0.2em] w-[96%] stroke-amber">
                <path d="M4 12C70 4 180 2 296 9" strokeWidth="5" strokeLinecap="round" />
              </svg>
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-display-sub text-muted-surface">{WEBSITE_MONITORING_LIVE ? HERO.sub : HERO.subNoWeb}</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <JoinButton start={HERO.primaryStart} className={JOIN_INK_CLASS}>
              {HERO.heroCta}
              <ArrowRight aria-hidden="true" className="size-4.5" />
            </JoinButton>
            {/* One primary action per screen: the tour is the quiet outlined button (D14), not a second filled one. */}
            <a href="#client-view" className="btn-ink-ghost group">
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
