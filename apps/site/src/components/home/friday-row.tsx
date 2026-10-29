'use client';

import { FridayBadge, TierMark } from '@cs/ui';
import { useRef, useState } from 'react';
import { SECTIONS } from '../../../content/home';
import { FRIDAY_ANSWERS } from '../../../content/sample-friday';
import { SAMPLE } from '../../sample/schema';
import { EvidencePills, type OpenEvidence } from '../sample/brief-items';
import { EvidencePanel } from '../sample/evidence-panel';
import { HomeSectionShell, SectionHeading } from './section-heading';

const ANSWER = FRIDAY_ANSWERS[1]!;

/** Copy on the left; on the right the sample's rivals with a static Ask box docked underneath. Its pills open the evidence sheet. */
export function FridayRow() {
  const [openId, setOpenId] = useState<string | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const open: OpenEvidence = (id, el) => {
    trigger.current = el;
    setOpenId(id);
  };
  let pillNo = 0;
  return (
    <HomeSectionShell id="friday" labelledBy="friday-heading" className="border-t border-line bg-canvas py-16 lg:py-20">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <SectionHeading section={SECTIONS.friday} />
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
            <FridayBadge />
            <p className="mt-2 text-13 font-semibold text-ink">{ANSWER.question}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink">
              {ANSWER.answer.map((part, i) => {
                const pill = part.cite && ANSWER.answer[i + 1]?.cite !== part.cite;
                return (
                  <span key={i}>
                    {part.text}
                    {pill && part.cite && (
                      <>
                        {' '}
                        <EvidencePills ids={[part.cite]} data={SAMPLE} onOpen={open} start={++pillNo} />
                      </>
                    )}
                  </span>
                );
              })}
            </p>
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
