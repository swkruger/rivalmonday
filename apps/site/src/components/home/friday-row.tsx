'use client';

import { FridayAvatar } from '@cs/ui';
import { useRef, useState } from 'react';
import { FRIDAY_PERSONA, HOME_IMAGES, SECTIONS } from '../../../content/home';
import { FRIDAY_ANSWERS } from '../../../content/sample-friday';
import { SAMPLE } from '../../sample/schema';
import { type OpenEvidence } from '../sample/brief-items';
import { EvidencePanel } from '../sample/evidence-panel';
import { FridayPanel } from '../sample/friday-panel';
import { HomeSectionShell, SectionHeading } from './section-heading';

/**
 * Copy on the left; on the right a live Friday over the sample. The dock opens on one
 * answer, any question chip types in another, and every citation pill opens the evidence sheet.
 */
export function FridayRow() {
  const [openId, setOpenId] = useState<string | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const open: OpenEvidence = (id, el) => {
    trigger.current = el;
    setOpenId(id);
  };
  return (
    <HomeSectionShell id="friday" labelledBy="friday-heading" className="border-t border-line bg-canvas py-20 lg:py-28">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <SectionHeading section={SECTIONS.friday} />
          <div data-slot="friday-persona" className="mt-6 flex max-w-3xl items-center gap-4">
            <FridayAvatar size="lg" />
            <p className="text-base text-ink-secondary">
              <b className="font-semibold text-ink">{FRIDAY_PERSONA.heading}</b> {FRIDAY_PERSONA.body}
            </p>
          </div>
          <p className="mt-4 max-w-3xl text-13 text-muted-ink">{FRIDAY_PERSONA.mcpNote}</p>
          {/* Desktop only: on phones it would push the live Friday further down the page. */}
          <img src={HOME_IMAGES.counter.src} alt={HOME_IMAGES.counter.alt} width={1200} height={800} loading="lazy" decoding="async" className="mt-8 hidden aspect-[16/9] w-full rounded-lg border border-line bg-muted-surface object-cover lg:block" />
        </div>
        <div data-slot="ask-dock" className="min-w-0 rounded-lg border border-line bg-surface p-5 shadow-float md:p-8">
            <FridayPanel answers={FRIDAY_ANSWERS} data={SAMPLE} onOpen={open} initialId={FRIDAY_ANSWERS[1]!.id} label={FRIDAY_PERSONA.prompt} />
          </div>
      </div>
      <EvidencePanel
        ev={openId ? SAMPLE.evidence[openId] ?? null : null}
        data={SAMPLE}
        onClose={() => setOpenId(null)}
        returnFocus={() => trigger.current}
      />
    </HomeSectionShell>
  );
}
