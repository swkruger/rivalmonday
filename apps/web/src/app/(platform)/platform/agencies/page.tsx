import { PageHeader } from '@/components/page-header';
import { requireOperatorContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { type AgencyRow, type AgencySort, AgencyTable, defaultDir, SORTS, type SortDir } from './agency-table';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Agencies' };

interface Search { sort?: string | string[]; dir?: string | string[] }
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Non-operators get the tool's permission_denied → 404 (callTool). */
export default async function PlatformAgenciesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const s = one(sp.sort);
  const sort: AgencySort = (SORTS as readonly string[]).includes(s ?? '') ? (s as AgencySort) : 'name';
  const d = one(sp.dir);
  const dir: SortDir = d === 'asc' || d === 'desc' ? d : defaultDir(sort);
  const { ctx } = await requireOperatorContext();
  const { rows } = await callTool<{ rows: AgencyRow[]; nextCursor: string | null }>(ctx, 'list_platform_agencies', { sort, dir, limit: 100 });
  return (
    <>
      <PageHeader title="Agencies" breadcrumb={[{ label: 'Platform', href: '/platform' }, { label: 'Agencies' }]} />
      <AgencyTable rows={rows} sort={sort} dir={dir} now={new Date()} />
    </>
  );
}
