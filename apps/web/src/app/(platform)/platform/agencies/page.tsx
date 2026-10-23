import Link from 'next/link';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { PrevNext } from '@/components/prev-next';
import { PAGE_COPY } from '@/help/copy';
import { requireOperatorContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';
import { viewerTimeZone } from '@/server/viewer-tz';
import { Button, Input, Label } from '@cs/ui';
import { type AgencyRow, type AgencySort, AgencyTable, agenciesHref, defaultDir, SORTS, type SortDir } from './agency-table';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Agencies' };

const HELP_KEY = 'page:platform.agencies';
const COPY = PAGE_COPY['platform.agencies'];

interface Search { q?: string | string[]; sort?: string | string[]; dir?: string | string[]; cursor?: string | string[] }
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Non-operators get the tool's permission_denied → 404 (callTool). */
export default async function PlatformAgenciesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const s = one(sp.sort);
  const sort: AgencySort = (SORTS as readonly string[]).includes(s ?? '') ? (s as AgencySort) : 'name';
  const d = one(sp.dir);
  const dir: SortDir = d === 'asc' || d === 'desc' ? d : defaultDir(sort);
  const q = (one(sp.q) ?? '').trim().slice(0, 100);
  const cursor = one(sp.cursor)?.slice(0, 200) || undefined;
  const { ctx } = await requireOperatorContext();
  const [{ rows, nextCursor, prevCursor }, guides, tz] = await Promise.all([
    callTool<{ rows: AgencyRow[]; nextCursor: string | null; prevCursor: string | null }>(ctx, 'list_platform_agencies', { sort, dir, ...(q ? { query: q } : {}), ...(cursor ? { cursor } : {}) }),
    helpGuides(ctx, 'platform'),
    viewerTimeZone(),
  ]);
  return (
    <>
      <PageHeader
        title="Agencies"
        breadcrumb={[{ label: 'Platform', href: '/platform' }, { label: 'Agencies' }]}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <TipRow
        items={[
          { label: 'About health', tip: 'platform.agencies.health' },
          { label: 'About the columns', tip: 'platform.agencies.columns' },
          { label: 'About billing states', tip: 'platform.agencies.billing' },
        ]}
      />
      <form role="search" method="get" action="/platform/agencies" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="dir" value={dir} />
        <div className="flex flex-col gap-1">
          <Label htmlFor="agency-q">Search agencies</Label>
          <Input id="agency-q" name="q" type="search" defaultValue={q} maxLength={100} className="w-72" />
        </div>
        <Button type="submit" variant="secondary">Search</Button>
        {q && <Link href={agenciesHref({ sort, dir })} className="py-2 text-sm font-semibold text-primary-soft-text hover:underline">Clear</Link>}
      </form>
      <AgencyTable rows={rows} sort={sort} dir={dir} now={new Date()} tz={tz} query={q} />
      <PrevNext
        previous={prevCursor ? agenciesHref({ q, sort, dir, cursor: prevCursor }) : null}
        next={nextCursor ? agenciesHref({ q, sort, dir, cursor: nextCursor }) : null}
      />
    </>
  );
}
