'use client';

import { FridayAvatar } from '@cs/ui';
import { useRef, useState } from 'react';
import { FRIDAY_PERSONA, SECTIONS } from '../../../content/home';
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
    <HomeSectionShell id="friday" labelledBy="friday-heading" className="border-t border-line bg-canvas">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <SectionHeading section={SECTIONS.friday} />
          <div data-slot="friday-persona" className="mt-6 flex max-w-3xl items-center gap-4">
            <span className="relative shrink-0">
              <FridayAvatar size="lg" />
              {/* Two static signal arcs off the robot's dish (radar motif); decorative. */}
              <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" strokeWidth="2.5" strokeLinecap="round" className="pointer-events-none absolute -top-4 left-15 size-8 stroke-amber">
                <path d="M2 18a12 12 0 0 1 12 12" strokeOpacity=".9" />
                <path d="M2 8a22 22 0 0 1 22 22" strokeOpacity=".55" />
              </svg>
            </span>
            <p className="text-base text-ink-secondary">
              <b className="font-semibold text-ink">{FRIDAY_PERSONA.heading}</b> {FRIDAY_PERSONA.body}
            </p>
          </div>
          <p className="mt-4 max-w-3xl text-13 text-muted-ink">{FRIDAY_PERSONA.mcpNote}</p>
        </div>
        <div data-slot="ask-dock" className="friday-dock min-w-0 rounded-frame border border-line p-5 shadow-frame md:p-8">
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
