import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { requireOperatorContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';
import { type AgencyRow, type AgencySort, AgencyTable, defaultDir, SORTS, type SortDir } from './agency-table';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Agencies' };

const HELP_KEY = 'page:platform.agencies';
const COPY = PAGE_COPY['platform.agencies'];

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
  const [{ rows }, guides] = await Promise.all([
    callTool<{ rows: AgencyRow[]; nextCursor: string | null }>(ctx, 'list_platform_agencies', { sort, dir, limit: 100 }),
    helpGuides(ctx, 'platform'),
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
      <AgencyTable rows={rows} sort={sort} dir={dir} now={new Date()} />
    </>
  );
}
