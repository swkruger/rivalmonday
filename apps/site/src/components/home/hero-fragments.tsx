import { FridayBadge } from '@cs/ui';
import { FRIDAY_ANSWERS } from '../../../content/sample-friday';
import { formatDay } from '../../sample/format';
import { SAMPLE, type SampleItem } from '../../sample/schema';

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

function firstSnapshot() {
  const ev = Object.values(SAMPLE.evidence).find((e) => e.kind === 'snapshot');
  return ev && ev.kind === 'snapshot' ? ev : null;
}

/**
 * Three offset product fragments built from the committed sample (no screenshots). Decorative: `aria-hidden`; the
 * hero adds one visually hidden summary. Below `lg` they stack in flow; from `lg` they overlap.
 */
export function HeroFragments() {
  const rows = briefRows();
  const snap = firstSnapshot();
  const answer = FRIDAY_ANSWERS[0];
  const sources = answer ? new Set(answer.answer.map((p) => p.cite).filter(Boolean)).size : 0;

  return (
    <div data-slot="hero-fragments" aria-hidden="true" className="relative z-10 flex flex-col gap-4 lg:block lg:min-h-[40rem]">
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

      {snap && (
        <div data-fragment="snapshot" className={`${FRAGMENT} p-3 lg:absolute lg:right-0 lg:top-[20rem] lg:w-[16.5rem]`}>
          <div className="overflow-hidden rounded-md border border-line bg-canvas p-3">
            <p className="mb-2 text-xs font-semibold text-ink">{snap.title}</p>
            <p className="ring-change rounded-xs bg-surface px-2 py-1 text-13 font-semibold text-ink">{snap.after[snap.changed]}</p>
          </div>
          <p className="mt-2 truncate text-xs text-ink-secondary">
            {snap.url} · captured {formatDay(snap.capturedAt)}
          </p>
        </div>
      )}

      {answer && (
        <div data-fragment="friday" className={`${FRAGMENT} p-4 lg:absolute lg:left-12 lg:top-[30rem] lg:w-[22.5rem]`}>
          <FridayBadge />
          <p className="mt-2 text-13 font-semibold text-ink">{answer.question}</p>
          <p className="mt-1 text-13 text-ink">
            {answer.answer[0]?.text}{' '}
            <span className="rounded-xs bg-muted-surface px-1.5 text-xs text-link">{sources} sources</span>
          </p>
        </div>
      )}
    </div>
  );
}
