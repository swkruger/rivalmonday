import { FridayBadge } from '@cs/ui';
import { FRIDAY_ANSWERS } from '../../../content/sample-friday';
import { formatDay } from '../../sample/format';
import { SAMPLE, type SampleItem } from '../../sample/schema';
import { HeroMapCard } from './hero-map-card';

// Site-owned elements carry `shadow-float`; it never goes through a @cs/ui primitive's className.
const FRAGMENT = 'hero-float rounded-lg border border-line bg-surface shadow-float';

const KIND_LABEL: Record<SampleItem['kind'], string> = { website: 'Website', reviews: 'Reviews', ads: 'Ads', rank: 'Map rankings', listing: 'Listing' };

/** Chart roles: you = secondary, then up to two rivals; no orange. */
const YOU_DOT = 'bg-secondary';
const RIVAL_DOTS = ['bg-chart-rival-2', 'bg-chart-context'] as const;

function briefRows() {
  const rivalOrder: string[] = [];
  return SAMPLE.items.slice(0, 3).map((item) => {
    let dot: string = YOU_DOT;
    if (item.rivalId) {
      if (!rivalOrder.includes(item.rivalId)) rivalOrder.push(item.rivalId);
      dot = RIVAL_DOTS[Math.min(rivalOrder.indexOf(item.rivalId), 1)]!;
    }
    return { item, dot, rival: item.rivalId ? SAMPLE.rivals.find((r) => r.id === item.rivalId)?.name : undefined };
  });
}

/**
 * Three offset product fragments built from the committed sample (no screenshots): the brief, the latest map scan
 * over the sample town and a Friday answer. Decorative: `aria-hidden`; the
 * hero adds one visually hidden summary. Below `lg` they stack in flow; from `lg` they sit offset without overlapping,
 * and the Friday card joins from `xl` (the column is too narrow for three at `lg`; phones meet Friday in the tour).
 */
export function HeroFragments() {
  const rows = briefRows();
  const answer = FRIDAY_ANSWERS[0];
  // Only the first part is shown, so only its cites count.
  const shown = answer?.answer[0];
  const sources = shown?.cite ? 1 : 0;

  return (
    <div data-slot="hero-fragments" aria-hidden="true" className="relative z-10 flex flex-col gap-4 lg:block lg:min-h-[38rem]">
      <div data-fragment="brief" className={`${FRAGMENT} p-4 lg:absolute lg:left-0 lg:top-0 lg:w-[25rem]`}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-ink">Monday brief · {SAMPLE.business.name}</span>
          <span className="shrink-0 rounded-full bg-muted-surface px-2 py-0.5 text-xs text-ink-secondary">Week of {formatDay(SAMPLE.weekOf)}</span>
        </div>
        {rows.map(({ item, dot, rival }) => (
          <div key={item.id} className="flex gap-2.5 border-t border-line py-2.5">
            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${dot}`} />
            <div className="min-w-0 text-13 text-ink">
              <p className="font-semibold">{item.headline}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {rival && <span className="text-xs text-ink-secondary">{rival}</span>}
                <span className="rounded-xs bg-muted-surface px-1.5 text-xs text-ink-secondary">{KIND_LABEL[item.kind]}</span>
                <span className="rounded-xs bg-muted-surface px-1.5 text-xs text-link">Evidence {item.evidenceIds.length}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div data-fragment="map" className={`${FRAGMENT} w-full max-w-xs self-center p-3 lg:absolute lg:right-0 lg:top-[18.5rem] lg:w-[16rem]`}>
        <HeroMapCard />
      </div>

      {answer && (
        <div data-fragment="friday" className={`${FRAGMENT} p-4 hidden xl:absolute xl:left-0 xl:top-[21rem] xl:block xl:w-[18rem]`}>
          <FridayBadge />
          <p className="mt-2 text-13 font-semibold text-ink">{answer.question}</p>
          <p className="mt-1 text-13 text-ink">
            {shown?.text}{' '}
            <span data-slot="friday-sources" className="rounded-xs bg-muted-surface px-1.5 text-xs text-link">{sources} {sources === 1 ? 'source' : 'sources'}</span>
          </p>
        </div>
      )}
    </div>
  );
}
