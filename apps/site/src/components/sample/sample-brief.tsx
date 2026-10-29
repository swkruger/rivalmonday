'use client';

import { Frame, StatusChip, Tag } from '@cs/ui';
import { useRef, useState } from 'react';
import { FRIDAY_ANSWERS } from '../../../content/sample-friday';
import { formatDay } from '../../sample/format';
import { SAMPLE } from '../../sample/schema';
import { BriefItems, type OpenEvidence } from './brief-items';
import { EvidencePanel } from './evidence-panel';
import { FridayPanel } from './friday-panel';
import { RankGrid } from './rank-grid';

/**
 * The interactive sample brief (spec § 7.1): a full Monday brief for a fictional business from the committed sample
 * JSON, entirely in the browser. `compact` (hero/teaser use) shows the first 3 items and no rank grid.
 */
export function SampleBrief({ compact }: { compact?: boolean }) {
  const data = SAMPLE;
  const [openId, setOpenId] = useState<string | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const open: OpenEvidence = (id, el) => {
    trigger.current = el;
    setOpenId(id);
  };
  const items = compact ? data.items.slice(0, 3) : data.items;
  return (
    <Frame className="flex flex-col gap-6 p-4 md:p-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone="info">{data.label}</StatusChip>
          <Tag>Week of {formatDay(data.weekOf)}</Tag>
        </div>
        <h3 className="text-xl font-semibold text-ink">Monday brief · {data.business.name}</h3>
        <p className="text-xs text-muted-ink">All businesses, people and places are fictional.</p>
      </header>
      <BriefItems items={items} data={data} onOpen={open} />
      {!compact && (
        <section aria-label="Map rankings" className="border-t border-line pt-6">
          <RankGrid data={data} onOpen={open} />
        </section>
      )}
      <section aria-label="Ask Friday" className="border-t border-line pt-6">
        <FridayPanel answers={FRIDAY_ANSWERS} data={data} onOpen={open} />
      </section>
      <EvidencePanel
        ev={openId ? data.evidence[openId] ?? null : null}
        data={data}
        onClose={() => setOpenId(null)}
        returnFocus={() => trigger.current}
      />
    </Frame>
  );
}
