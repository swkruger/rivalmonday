'use client';

import { Band, CitationPill, Tag, TierMark } from '@cs/ui';
import type { SampleBriefData, SampleItem } from '../../sample/schema';
import { evidenceSource } from './evidence-panel';

export type OpenEvidence = (id: string, trigger: HTMLElement) => void;

const KIND_LABEL: Record<SampleItem['kind'], string> = { website: 'Website', reviews: 'Reviews', ads: 'Ads', rank: 'Map rankings', listing: 'Listing' };

/**
 * Inline evidence pills for a list of ids; each opens the evidence sheet. Shared by brief items, the grid and Friday.
 * `start` numbers the first pill, so a host showing several groups keeps "Evidence n" distinct.
 */
export function EvidencePills({ ids, data, onOpen, start = 1 }: { ids: string[]; data: SampleBriefData; onOpen: OpenEvidence; start?: number }) {
  return (
    <>
      {ids.map((id, i) => {
        const ev = data.evidence[id];
        if (!ev) return null;
        const { source, date } = evidenceSource(ev);
        return (
          <CitationPill key={id} asChild n={start + i} source={source} date={date}>
            <button type="button" aria-haspopup="dialog" onClick={(e) => onOpen(id, e.currentTarget)} />
          </CitationPill>
        );
      })}
    </>
  );
}

/** DS feed rows (follows apps/web brief-view): rival, headline, what changed (the claim, clickable), why it matters, action, pills. */
export function BriefItems({ items, data, onOpen, sourceLinks = {} }: {
  items: SampleItem[];
  data: SampleBriefData;
  onOpen: OpenEvidence;
  /** Kind → page explaining how that evidence is collected; the kind tag becomes a link when present. */
  sourceLinks?: Partial<Record<SampleItem['kind'], string>>;
}) {
  return (
    <div className="flex flex-col">
      {items.map((item) => {
        const rival = item.rivalId ? data.rivals.find((r) => r.id === item.rivalId) : undefined;
        const first = item.evidenceIds.find((id) => data.evidence[id]);
        // Some exported items repeat the headline as "what changed": then the headline itself is the clickable claim.
        const dup = item.whatChanged.replace(/\.$/, '') === item.headline;
        const claim = first ? (
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={(e) => onOpen(first, e.currentTarget)}
            className="text-left underline decoration-line-strong decoration-dotted underline-offset-4 hover:decoration-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {item.whatChanged}
          </button>
        ) : item.whatChanged;
        return (
          <article key={item.id} data-item={item.id} className="flex flex-col gap-2 border-t border-line py-5 first:border-t-0 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {rival && <span className="font-semibold text-ink">{rival.name}</span>}
              {rival && <TierMark tier={rival.tier} />}
              {sourceLinks[item.kind] ? (
                <a href={sourceLinks[item.kind]} title={`How we collect ${KIND_LABEL[item.kind].toLowerCase()} evidence`} className="rounded-xs hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  <Tag>{KIND_LABEL[item.kind]}</Tag>
                </a>
              ) : (
                <Tag>{KIND_LABEL[item.kind]}</Tag>
              )}
            </div>
            {dup ? <h4 className="text-base font-semibold text-ink">{claim}</h4> : (
              <>
                <h4 className="text-base font-semibold text-ink">{item.headline}</h4>
                <p className="text-sm text-ink">{claim}</p>
              </>
            )}
            <Band tone="muted" className="text-sm text-ink">{item.whyItMatters}</Band>
            <p className="text-sm text-ink">
              <b className="font-semibold">Recommended:</b> {item.recommendedAction}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <EvidencePills ids={item.evidenceIds} data={data} onOpen={onOpen} />
            </div>
          </article>
        );
      })}
    </div>
  );
}
