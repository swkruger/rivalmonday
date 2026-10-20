import { isAgencyRole } from '@cs/core';
import type { UsageRow } from '@cs/tools';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { SpendBadge } from '@/components/spend-badge';
import { WriteGuard } from '@/components/read-only';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { requireContext } from '@/server/current-viewer';
import { formatUsd } from '@/server/format';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';
import { saveLimitsAction } from './actions';
import { LimitsForm } from './limits-form';
import { QuestionsCell } from './questions-cell';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Usage & limits' };

const HELP_KEY = 'page:agency.settings.usage';
const COPY = PAGE_COPY['agency.settings.usage'];

export default async function UsagePage() {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const [{ month, items, agencyLevelUsd }, guides] = await Promise.all([callTool<{ month: string; items: UsageRow[]; agencyLevelUsd: number | null }>(ctx, 'get_usage', {}), helpGuides(ctx, 'agency')]);
  const atWarning = items.filter((r) => r.spend.level === 'warning').length;
  const atOver = items.filter((r) => r.spend.level === 'over').length;

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

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="rounded-[14px] bg-surface p-6 shadow-card">
          <h3 className="text-sm font-semibold">Near cap</h3>
          <div className="mt-2 text-[34px] font-extrabold tracking-tight text-secondary">{atWarning}</div>
        </div>
        <div className="rounded-[14px] bg-surface p-6 shadow-card">
          <h3 className="text-sm font-semibold">Over cap</h3>
          <div className="mt-2 text-[34px] font-extrabold tracking-tight text-secondary">{atOver}</div>
        </div>
      </div>

      {items.length === 0 && <EmptyState {...COPY.empty.noClients} guideAnchor="what-this-page-tells-you" />}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Client</TableHead>
            <TableHead>
              <span className="inline-flex items-center gap-1.5">
                Spend
                <HelpTip tip="agency.settings.usage.spend" />
              </span>
            </TableHead>
            <TableHead>
              <span className="inline-flex items-center gap-1.5">
                Share
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
            {ctx.role === 'agency_admin' && (
              <WriteGuard>
                <TableHead>
                  <span className="inline-flex items-center gap-1.5">
                    Limits
                    <HelpTip tip="agency.settings.usage.limits" />
                  </span>
                </TableHead>
              </WriteGuard>
            )}
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
                  <Badge variant="outline" className="ml-2">
                    Prospect
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                {formatUsd(row.spend.monthToDateUsd)} of {formatUsd(row.spend.capUsd)}
              </TableCell>
              <TableCell>
                <SpendBadge spend={row.spend} />
              </TableCell>
              <TableCell>
                {row.competitors} of {row.competitorLimit}
                {row.competitors > row.competitorLimit && <div className="text-amber-text">Over limit</div>}
              </TableCell>
              <TableCell>
                <QuestionsCell questions={row.questions} />
              </TableCell>
              {ctx.role === 'agency_admin' && (
                <WriteGuard>
                  <TableCell>
                    <LimitsForm key={row.clientId} action={saveLimitsAction} clientId={row.clientId} clientName={row.name} capUsd={row.spend.capUsd} competitorLimit={row.competitorLimit} askQuota={row.questions.quota} />
                  </TableCell>
                </WriteGuard>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <p className="text-muted-ink">
        Shared monitoring of competitors (Google profile, reviews, ads) and the intelligence engine’s shared work are not yet split across clients; they’ll be allocated in a later release.
        {agencyLevelUsd !== null && <> Agency-level spend not tied to a client: {formatUsd(agencyLevelUsd)}</>}
      </p>
    </>
  );
}
