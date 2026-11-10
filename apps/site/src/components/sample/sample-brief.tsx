'use client';

import { Frame, StatusChip, Tag } from '@cs/ui';
import { useRef, useState } from 'react';
import { FRIDAY_ANSWERS } from '../../../content/sample-friday';
import { formatDay } from '../../sample/format';
import { SAMPLE, type SampleItem } from '../../sample/schema';
import { BriefItems, type OpenEvidence } from './brief-items';
import { EvidencePanel } from './evidence-panel';
import { FridayPanel } from './friday-panel';
import { RankGrid } from './rank-grid';

/** Kind → source page href, built on the server (`lib/source-links.ts`). */
type SourceLinks = Partial<Record<SampleItem['kind'], string>>;

/**
 * The interactive sample brief (spec § 7.1): a full Monday brief for a fictional business from the committed sample
 * JSON, entirely in the browser. `compact` (hero/teaser use) shows the first 3 items and no rank grid. From `lg` the
 * brief keeps a readable line length and the map rankings sit beside it.
 */
export function SampleBrief({ compact, sourceLinks }: { compact?: boolean; sourceLinks?: SourceLinks }) {
  const data = SAMPLE;
  const [openId, setOpenId] = useState<string | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const open: OpenEvidence = (id, el) => {
    trigger.current = el;
    setOpenId(id);
  };
  const items = compact ? data.items.slice(0, 3) : data.items;
  return (
    <Frame className="product-frame flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      {/* D14: the brief's header is the canvas's solid ink band (white title, light week line, outline chips). */}
      <header className="-mx-4 -mt-4 flex flex-col gap-2 bg-ink px-4 py-5 md:-mx-6 md:-mt-6 md:px-6 md:py-6 lg:-mx-8 lg:-mt-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone="info" className="bg-transparent text-muted-surface ring-1 ring-surface/20">{data.label}</StatusChip>
          <Tag className="bg-transparent text-muted-surface ring-1 ring-surface/20">Week of {formatDay(data.weekOf)}</Tag>
        </div>
        <h3 className="text-xl font-bold text-surface">Monday brief · {data.business.name}</h3>
        <p className="text-xs text-muted-surface">All businesses, people and places are fictional.</p>
      </header>
      <div className={compact ? '' : 'grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-10'}>
        <div className="min-w-0 max-w-3xl">
          <BriefItems items={items} data={data} onOpen={open} sourceLinks={sourceLinks} />
        </div>
        {!compact && (
          <section aria-label="Map rankings" className="min-w-0 border-t border-line pt-6 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
            <div className="lg:sticky lg:top-24">
              <RankGrid data={data} onOpen={open} howHref={sourceLinks?.rank} />
            </div>
          </section>
        )}
      </div>
      {/* D14: the canvas's dark Friday card, here as the frame's closing band. */}
      <section aria-label="Ask Friday" className="friday-ink -mx-4 -mb-4 px-4 py-6 md:-mx-6 md:-mb-6 md:px-6 lg:-mx-8 lg:-mb-8 lg:px-8">
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
