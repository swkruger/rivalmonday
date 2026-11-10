import { BadgeCheck, Globe } from 'lucide-react';
import { CHOOSER } from '../../../content/chooser';
import { Doors } from './doors';
import { HeroGallery } from './hero-gallery';
import { HeroHeadline } from './hero-headline';
import { HeroShell } from './hero-shell';

const PROOF_ICONS = [Globe, BadgeCheck];

/** The home page's first screen: the headline, "Which one are you?" and the two doors. No join button, no price. */
export function HomeHero() {
  return (
    <HeroShell>
      <div className="relative z-10 min-w-0">
        <p className="text-13 font-medium text-muted-surface">{CHOOSER.eyebrow}</p>
        <HeroHeadline headline={CHOOSER.headline} />
        <p className="mt-6 max-w-xl text-display-sub text-muted-surface">{CHOOSER.sub}</p>
        <h2 id="home-question" className="mt-8 text-xl font-semibold text-surface">
          {CHOOSER.question}
        </h2>
        <div className="mt-4 max-w-2xl">
          <Doors headingId="home-question" />
        </div>
        <p className="mt-5 text-sm text-muted-surface">
          {CHOOSER.sample.lead}{' '}
          <a href={CHOOSER.sample.href} className="font-medium text-surface underline underline-offset-4 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            {CHOOSER.sample.label}
          </a>
        </p>
        <ul aria-label="Why trust it" className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-surface/15 pt-5 text-13 text-muted-surface">
          {CHOOSER.proof.map((p, i) => {
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
