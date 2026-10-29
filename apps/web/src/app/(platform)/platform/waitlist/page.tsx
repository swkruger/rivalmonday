import { platformRole } from '@cs/tools';
import { Button, Input, Label, Section, TabsLink, TabsLinkList } from '@cs/ui';
import Link from 'next/link';
import { EmptyState } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { OffPageNotice, PrevNext } from '@/components/prev-next';
import { PAGE_COPY } from '@/help/copy';
import { requireOperatorContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { platformAdmins } from '@/server/runtime-env';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';
import { verticalOptions } from '@/server/verticals';
import { viewerTimeZone } from '@/server/viewer-tz';
import { type WaitlistRow, WaitlistTable, type WaitlistTab } from './waitlist-table';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Waitlist' };

const HELP_KEY = 'page:platform.waitlist';
const COPY = PAGE_COPY['platform.waitlist'];

const TABS: { key: WaitlistTab; label: string; input: { kind: 'agency' } | { kind: 'business' } | { sample: true } }[] = [
  { key: 'agencies', label: 'Agencies', input: { kind: 'agency' } },
  { key: 'businesses', label: 'Businesses', input: { kind: 'business' } },
  { key: 'samples', label: 'Sample requests', input: { sample: true } },
];

interface Listing {
  entries: WaitlistRow[];
  nextCursor: string | null;
  prevCursor: string | null;
  total: number;
  counts: { agencyNew: number; businessNew: number; sampleRequested: number };
  sampleMonth: { used: number; limit: number };
  estimate: { discoveryCapUsd: number; startingPointAvgUsd: number | null; basedOn: number };
}

interface Search { tab?: string | string[]; q?: string | string[]; cursor?: string | string[] }
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const usd = (n: number) => `$${n.toFixed(2)}`;

function hrefOf(tab: WaitlistTab, extra: { q?: string; cursor?: string } = {}): string {
  const p = new URLSearchParams();
  if (tab !== 'agencies') p.set('tab', tab);
  if (extra.q) p.set('q', extra.q);
  if (extra.cursor) p.set('cursor', extra.cursor);
  const s = p.toString();
  return s ? `/platform/waitlist?${s}` : '/platform/waitlist';
}

/** Phase 17a: the pilot waitlist (agencies, businesses, sample requests). Operators only (a refusal is a 404); actions arrive with the invite, assign and sample tasks. */
export default async function PlatformWaitlistPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === one(sp.tab)) ?? TABS[0]!;
  const q = one(sp.q)?.trim().slice(0, 120) || undefined;
  const cursor = one(sp.cursor)?.slice(0, 200) || undefined;
  const { ctx } = await requireOperatorContext();
  const [list, guides, tz, catalogue, role] = await Promise.all([
    callTool<Listing>(ctx, 'list_waitlist', { ...tab.input, ...(q ? { q } : {}), ...(cursor ? { cursor } : {}) }),
    helpGuides(ctx, 'platform'),
    viewerTimeZone(),
    verticalOptions(),
    platformRole({ service: dbs().service, platformAdmins: platformAdmins() }, ctx),
  ]);
  const verticals = Object.fromEntries(catalogue.map((v) => [v.id, v.name]));
  const newCount: Record<WaitlistTab, number> = { agencies: list.counts.agencyNew, businesses: list.counts.businessNew, samples: list.counts.sampleRequested };
  const { entries, nextCursor, prevCursor, total, sampleMonth, estimate } = list;
  const emptyKey = q ? 'search' : tab.key;
  return (
    <>
      <PageHeader
        title="Waitlist"
        breadcrumb={[{ label: 'Platform', href: '/platform' }, { label: 'Waitlist' }]}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <TipRow items={[{ label: 'About the list', tip: 'platform.waitlist.about' }, { label: 'About sample briefs', tip: 'platform.waitlist.sample' }]} />
      <TabsLinkList aria-label="Waitlist views">
        {TABS.map((t) => (
          <TabsLink key={t.key} asChild active={t.key === tab.key}>
            <Link href={hrefOf(t.key)}>
              {t.label} <span className="text-muted-ink">({newCount[t.key]})</span>
            </Link>
          </TabsLink>
        ))}
      </TabsLinkList>
      <form role="search" method="get" action="/platform/waitlist" className="flex flex-wrap items-end gap-2">
        {tab.key !== 'agencies' && <input type="hidden" name="tab" value={tab.key} />}
        <div className="flex flex-col gap-1">
          <Label htmlFor="waitlist-q">Search the waitlist</Label>
          <Input id="waitlist-q" name="q" type="search" defaultValue={q} maxLength={120} className="w-72" />
        </div>
        <Button type="submit" variant="outline">Search</Button>
        {q && <Link href={hrefOf(tab.key)} className="py-2 text-sm font-medium text-primary-soft-text hover:underline">Clear</Link>}
      </form>
      <Section title={`${tab.label} (${total})`}>
        {tab.key === 'samples' && (
          <div className="mb-3 flex flex-col gap-1 text-sm text-muted-ink">
            <p>This month: {sampleMonth.used} of {sampleMonth.limit} sample briefs</p>
            <p>
              {`Estimated cost per sample: discovery up to ${usd(estimate.discoveryCapUsd)} + starting point${
                estimate.startingPointAvgUsd === null ? ': no history yet' : ` about ${usd(estimate.startingPointAvgUsd)} (average of the last ${estimate.basedOn})`
              }`}
            </p>
          </div>
        )}
        {entries.length === 0 && (total > 0 || prevCursor) ? (
          <OffPageNotice firstHref={hrefOf(tab.key, { q })} />
        ) : entries.length === 0 ? (
          <EmptyState {...COPY.empty[emptyKey]} guideAnchor="what-this-page-tells-you" />
        ) : (
          <WaitlistTable rows={entries} tab={tab.key} tz={tz} verticals={verticals} canWrite={role === 'owner' || role === 'staff'} />
        )}
      </Section>
      <PrevNext previous={prevCursor ? hrefOf(tab.key, { q, cursor: prevCursor }) : null} next={nextCursor ? hrefOf(tab.key, { q, cursor: nextCursor }) : null} />
    </>
  );
}
