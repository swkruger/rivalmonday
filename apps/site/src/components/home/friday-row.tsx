'use client';

import { TierMark } from '@cs/ui';
import { useRef, useState } from 'react';
import { SECTIONS } from '../../../content/home';
import { FRIDAY_ANSWERS } from '../../../content/sample-friday';
import { SAMPLE } from '../../sample/schema';
import { type OpenEvidence } from '../sample/brief-items';
import { EvidencePanel } from '../sample/evidence-panel';
import { FridayPanel } from '../sample/friday-panel';
import { HomeSectionShell, SectionHeading } from './section-heading';

/**
 * Copy on the left; on the right the sample's rivals with Friday docked underneath. The dock is live: it opens on one
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
    <HomeSectionShell id="friday" labelledBy="friday-heading" className="border-t border-line bg-canvas py-16 lg:py-20">
      <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="lg:sticky lg:top-28">
          <SectionHeading section={SECTIONS.friday} />
        </div>
        <div className="min-w-0 overflow-hidden rounded-lg border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Rivals watched for {SAMPLE.business.name}</caption>
            <thead>
              <tr className="border-b border-line text-13 text-muted-ink">
                <th scope="col" className="px-4 py-2.5 font-medium">Rival</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Tier</th>
              </tr>
            </thead>
            <tbody>
              {SAMPLE.rivals.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-2.5 font-medium text-ink">{r.name}</td>
                  <td className="px-4 py-2.5"><TierMark tier={r.tier} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div data-slot="ask-dock" className="border-t border-line bg-canvas p-4">
            <FridayPanel answers={FRIDAY_ANSWERS} data={SAMPLE} onOpen={open} initialId={FRIDAY_ANSWERS[1]!.id} label="Pick a question" />
          </div>
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
