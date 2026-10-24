import { isAgencyRole } from '@cs/core';
import type { UsageRow } from '@cs/tools';
import { StatusChip, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { formatCredits, formatCreditsOf } from '@/lib/format';
import { reachedCopy } from '@/lib/spend-copy';
import { SpendBadge } from '@/components/spend-badge';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { CLIENT_STATUS, labelFor } from '@/lib/labels';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';
import { QuestionsCell } from './questions-cell';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Usage & limits' };

const HELP_KEY = 'page:agency.settings.usage';
const COPY = PAGE_COPY['agency.settings.usage'];

export default async function UsagePage() {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const [{ month, items, agencyLevelCredits, totalCredits }, guides] = await Promise.all([callTool<{ month: string; items: UsageRow[]; agencyLevelCredits: number | null; totalCredits: number }>(ctx, 'get_usage', {}), helpGuides(ctx, 'agency')]);
  const count = (level: UsageRow['credits']['level']) => items.filter((r) => r.credits.level === level).length;

  return (
    <>
      <PageHeader
        title="Usage & limits"
        breadcrumb={[{ label: 'Agency settings', href: '/agency/settings' }, { label: 'Usage & limits' }]}
        description={
          <>
            <HelpText text={COPY.description} /> Showing {month}.
          </>
        }
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />

      <div className="grid gap-5 sm:grid-cols-3">
        {([['Near limit', count('near')], ['Limit reached', count('reached')], ['Paused', count('paused')]] as const).map(([label, n]) => (
          <div key={label} className="rounded-md border border-line bg-surface p-6">
            <h3 className="text-sm font-semibold">{label}</h3>
            <div className="mt-2 text-[34px] font-bold tracking-tight text-secondary">{n}</div>
          </div>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState {...COPY.empty.noClients} guideAnchor="what-this-page-tells-you" />
      ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Client</TableHead>
            <TableHead>
              <span className="inline-flex items-center gap-1.5">
                Credits
                <HelpTip tip="agency.settings.usage.spend" />
              </span>
            </TableHead>
            <TableHead>
              <span className="inline-flex items-center gap-1.5">
                Status
                <HelpTip tip="agency.settings.usage.share" />
              </span>
            </TableHead>
            <TableHead>
              <span className="inline-flex items-center gap-1.5">
                Competitors
                <HelpTip tip="agency.settings.usage.competitors" />
              </span>
            </TableHead>
            <TableHead>
              <span className="inline-flex items-center gap-1.5">
                Questions
                <HelpTip tip="agency.settings.usage.questions" />
              </span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((row) => (
            <TableRow key={row.clientId}>
              <TableCell>
                <Link href={row.status === 'prospect' ? `/agency/prospects/${row.clientId}` : `/c/${row.clientId}`} className="font-semibold text-primary-soft-text">
                  {row.name}
                </Link>
                {row.status === 'prospect' && (
                  <span className="ml-2 inline-block">
                    <StatusChip tone={labelFor(CLIENT_STATUS, row.status).tone}>{labelFor(CLIENT_STATUS, row.status).label}</StatusChip>
                  </span>
                )}
              </TableCell>
              <TableCell>
                {formatCreditsOf(row.credits.used, row.credits.limit)}
                {row.credits.level === 'reached' && <div className="mt-1 max-w-[34ch] text-xs text-muted-ink">{reachedCopy(row.name)}</div>}
              </TableCell>
              <TableCell>
                <SpendBadge credits={row.credits} />
              </TableCell>
              <TableCell>
                {row.competitors} of {row.competitorLimit}
                {row.competitors > row.competitorLimit && <div className="text-amber-text">Over limit</div>}
              </TableCell>
              <TableCell>
                <QuestionsCell questions={row.questions} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      )}

      <p className="text-muted-ink">
        Shared monitoring of a competitor (Google profile, reviews, ads, job posts) is split equally between the clients that track it. The intelligence engine’s own shared work is not split across clients, so it is not in these figures.
        {agencyLevelCredits !== null && <> Credits not tied to a client: {formatCredits(agencyLevelCredits)}.</>} Total this month: {formatCredits(totalCredits)}.
      </p>
    </>
  );
}
