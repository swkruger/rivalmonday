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
import { platformRole } from '@cs/tools';
import { Button, Input, Label } from '@cs/ui';
import { dbs } from '@/server/db';
import { platformAdmins } from '@/server/runtime-env';
import { type AgencyRow, type AgencySort, AgencyTable, type AgencyStatus, agenciesHref, defaultDir, SORTS, STATUSES, type SortDir } from './agency-table';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Agencies' };

const HELP_KEY = 'page:platform.agencies';
const COPY = PAGE_COPY['platform.agencies'];

interface Search { status?: string | string[]; q?: string | string[]; sort?: string | string[]; dir?: string | string[]; cursor?: string | string[] }
const FILTERS: { key: AgencyStatus; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'on_hold', label: 'On hold' },
  { key: 'archived', label: 'Archived' },
  { key: 'all', label: 'All' },
];
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Non-operators get the tool's permission_denied → 404 (callTool). */
export default async function PlatformAgenciesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const s = one(sp.sort);
  const sort: AgencySort = (SORTS as readonly string[]).includes(s ?? '') ? (s as AgencySort) : 'name';
  const d = one(sp.dir);
  const dir: SortDir = d === 'asc' || d === 'desc' ? d : defaultDir(sort);
  const st = one(sp.status);
  const status: AgencyStatus = (STATUSES as readonly string[]).includes(st ?? '') ? (st as AgencyStatus) : 'active';
  const q = (one(sp.q) ?? '').trim().slice(0, 100);
  const cursor = one(sp.cursor)?.slice(0, 200) || undefined;
  const { ctx } = await requireOperatorContext();
  const [{ rows, nextCursor, prevCursor, counts }, guides, tz, role] = await Promise.all([
    callTool<{ rows: AgencyRow[]; nextCursor: string | null; prevCursor: string | null; counts?: { onHold: number; archived: number } }>(ctx, 'list_platform_agencies', { sort, dir, ...(status !== 'active' ? { status } : {}), ...(q ? { query: q } : {}), ...(cursor ? { cursor } : {}) }),
    helpGuides(ctx, 'platform'),
    viewerTimeZone(),
    platformRole({ service: dbs().service, platformAdmins: platformAdmins() }, ctx),
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
          { label: 'About the status filters', tip: 'platform.agencies.status' },
        ]}
      />
      <nav aria-label="Agency status" className="flex flex-wrap gap-1">
        {FILTERS.map((f) => {
          const n = f.key === 'on_hold' ? counts?.onHold : f.key === 'archived' ? counts?.archived : undefined;
          const current = f.key === status;
          return (
            <Link
              key={f.key}
              href={agenciesHref({ q, status: f.key, sort, dir })}
              aria-current={current ? 'page' : undefined}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${current ? 'bg-secondary text-white' : 'bg-muted-surface text-ink hover:bg-border'}`}
            >
              {f.label}
              {n !== undefined && ` ${n}`}
            </Link>
          );
        })}
      </nav>
      <form role="search" method="get" action="/platform/agencies" className="flex flex-wrap items-end gap-2">
        {status !== 'active' && <input type="hidden" name="status" value={status} />}
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="dir" value={dir} />
        <div className="flex flex-col gap-1">
          <Label htmlFor="agency-q">Search agencies</Label>
          <Input id="agency-q" name="q" type="search" defaultValue={q} maxLength={100} className="w-72" />
        </div>
        <Button type="submit" variant="outline">Search</Button>
        {q && <Link href={agenciesHref({ status, sort, dir })} className="py-2 text-sm font-semibold text-primary-soft-text hover:underline">Clear</Link>}
      </form>
      <AgencyTable rows={rows} sort={sort} dir={dir} now={new Date()} tz={tz} query={q} status={status} canUnarchive={role === 'owner'} />
      <PrevNext
        previous={prevCursor ? agenciesHref({ q, status, sort, dir, cursor: prevCursor }) : null}
        next={nextCursor ? agenciesHref({ q, status, sort, dir, cursor: nextCursor }) : null}
      />
    </>
  );
}
