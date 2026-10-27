import type { AdList, GeoGridView, PriceMatrixView, TopicBenchmarkView } from '@cs/tools';
import Link from 'next/link';
import { formatDate } from '@/lib/format';
import { formatPrice, pricingHref } from '../../pricing/format';

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);
const LINK = 'mt-3 inline-block text-sm font-semibold text-primary-soft-text';

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-3 text-base font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

export function PricesSection({ clientId, competitorId, matrix }: { clientId: string; competitorId: string; matrix: PriceMatrixView }) {
  const row = matrix.rows.find((r) => r.competitorId === competitorId);
  const names = new Map(matrix.services.map((s) => [s.id, s.name]));
  const cells = (row?.cells ?? []).filter((c) => c.prices.length > 0).slice(0, 5);
  return (
    <Section id="profile-prices" title="Prices">
      {cells.length === 0 ? <p className="text-sm text-muted-ink">No prices seen on its website yet.</p> : (
        <ul className="flex flex-col divide-y divide-line text-sm">
          {cells.map((c) => (
            <li key={c.serviceId} className="flex items-baseline justify-between gap-3 py-2">
              <span className="text-ink">{names.get(c.serviceId) ?? c.serviceId}</span>
              <span className="font-semibold text-secondary">{c.prices.map(formatPrice).join(' · ')}</span>
            </li>
          ))}
        </ul>
      )}
      {cells[0] && <Link href={pricingHref(clientId, { competitor: competitorId, service: cells[0].serviceId })} className={LINK}>See pricing</Link>}
    </Section>
  );
}

export function AdsSection({ clientId, competitorId, ads, timezone }: { clientId: string; competitorId: string; ads: AdList; timezone: string }) {
  return (
    <Section id="profile-ads" title="Ads">
      {ads.items.length === 0 ? <p className="text-sm text-muted-ink">No active ads.</p> : (
        <ul className="flex flex-col divide-y divide-line text-sm">
          {ads.items.map((a) => (
            <li key={a.id} className="py-2">
              <span className="font-semibold text-ink">{a.title ?? a.text?.slice(0, 80) ?? 'Untitled ad'}</span>
              <span className="block text-xs text-muted-ink">{a.platform === 'meta' ? 'Meta' : 'Google'} · first seen {formatDate(a.firstSeenAt, { tz: timezone })}</span>
            </li>
          ))}
        </ul>
      )}
      <Link href={`/c/${clientId}/ads?competitor=${competitorId}`} className={LINK}>See ads</Link>
    </Section>
  );
}

export function ReviewsSection({ clientId, competitorId, benchmark }: { clientId: string; competitorId: string; benchmark: TopicBenchmarkView }) {
  const me = benchmark.businesses.find((b) => b.competitorId === competitorId);
  const you = benchmark.businesses.find((b) => b.self);
  const names = new Map(benchmark.topics.map((t) => [t.id, t.name]));
  const top = (me?.topics ?? []).filter((t) => t.share !== null && t.share > 0).sort((a, b) => b.share! - a.share!).slice(0, 3);
  return (
    <Section id="profile-reviews" title="Reviews">
      {!me || me.reviews === 0 ? <p className="text-sm text-muted-ink">{`No reviews in the last ${benchmark.windowDays} days.`}</p> : (
        <>
          <p className="text-sm text-ink">{`${me.avgRating === null ? '—' : me.avgRating.toFixed(1)} ★ average · ${me.reviews} reviews in ${benchmark.windowDays} days`}</p>
          {top.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 text-sm text-ink">
              {top.map((t) => (
                <li key={t.topicId}>
                  {`${names.get(t.topicId) ?? t.topicId} — ${pct(t.share)}${you ? ` (you ${pct(you.topics.find((y) => y.topicId === t.topicId)?.share ?? null)})` : ''}`}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <Link href={`/c/${clientId}/reviews?business=${competitorId}`} className={LINK}>See reviews</Link>
    </Section>
  );
}

export function RankingsSection({ clientId, competitorId, geo }: { clientId: string; competitorId: string; geo: GeoGridView }) {
  return (
    <Section id="profile-rankings" title="Local rankings">
      {geo.setup === 'no_keywords' ? <p className="text-sm text-muted-ink">Rank tracking starts once keywords and a service area are set.</p>
        : geo.setup === 'no_scan' ? <p className="text-sm text-muted-ink">The first weekly rank scan hasn’t run yet.</p>
        : (
          <ul className="flex flex-col gap-1 text-sm">
            {geo.keywordSummaries.map((k) => (
              <li key={k.keyword}>
                <Link href={`/c/${clientId}/rankings?${new URLSearchParams({ keyword: k.keyword, business: competitorId }).toString()}`} className="font-semibold text-primary-soft-text">
                  {`${k.keyword} — top 3 at ${k.top3} of ${k.points} · avg ${k.avgRank ?? '—'}`}
                </Link>
              </li>
            ))}
          </ul>
        )}
    </Section>
  );
}
