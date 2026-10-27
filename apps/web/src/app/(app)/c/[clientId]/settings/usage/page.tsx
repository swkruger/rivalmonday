import { isAgencyRole } from '@cs/core';
import type { SpendCredits } from '@cs/tools';
import { Section } from '@cs/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { clientSettingsCrumbs } from '@/components/client-crumbs';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { SpendBadge } from '@/components/spend-badge';
import { formatCreditsOf } from '@/lib/format';
import { askQuotaText, pausedForClient, reachedCopy } from '@/lib/spend-copy';
import { PAGE_COPY } from '@/help/copy';
import { hasClientSettings } from '@/server/client-settings-nav';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { themeForViewer } from '@/server/theme';
import { callTool } from '@/server/tools';

export const dynamic = 'force-dynamic';
/** R18: the (app) title template appends the agency's name: "Usage · {agency}". */
export const metadata: Metadata = { title: 'Usage' };

const HELP_KEY = 'page:client.settings.usage';
const COPY = PAGE_COPY['client.settings.usage'];

interface MyUsage {
  month: string;
  credits: SpendCredits;
  questions: { used: number; quota: number } | null;
}

/**
 * 7b1: this month's credits for one client, in credits only (never dollars). Agency roles and the client owner; the tool
 * refuses everyone else (viewers, guests, another client) and `callTool` turns that into a 404. Calm colours: no red or orange.
 */
export default async function ClientUsagePage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { viewer, ctx } = await requireContext();
  if (!isAgencyRole(ctx.role) && ctx.role !== 'client_owner') notFound();
  const [usage, profile, settingsLinked, guides, { branding }] = await Promise.all([
    callTool<MyUsage>(ctx, 'get_my_usage', { clientId }),
    callTool<{ name: string }>(ctx, 'get_client_profile', { clientId }),
    hasClientSettings(clientId),
    helpGuides(ctx, 'client', clientId),
    themeForViewer(viewer),
  ]);
  const { credits, questions } = usage;
  const pct = Math.min(100, Math.round(credits.ratio * 100));

  return (
    <>
      <PageHeader
        title="Usage"
        breadcrumb={clientSettingsCrumbs({ id: clientId, name: profile.name }, 'Usage', settingsLinked)}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <TipRow items={[{ label: 'Credits', tip: 'client.settings.usage.credits' }, { label: 'Status', tip: 'client.settings.usage.status' }]} />
      <Section title="Credits this month" className="max-w-[640px]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-lg font-semibold">{formatCreditsOf(credits.used, credits.limit)}</span>
            <SpendBadge credits={credits} />
          </div>
          <div role="progressbar" aria-label="Credits used this month" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-2 w-full overflow-hidden rounded-full bg-muted-surface">
            <div className="h-full rounded-full bg-secondary" style={{ width: `${pct}%` }} />
          </div>
          {credits.level === 'reached' && <p className="text-sm">{reachedCopy(profile.name)}</p>}
          {credits.level === 'paused' && ctx.role === 'client_owner' && <p className="text-sm">{pausedForClient(branding.displayName)}</p>}
        </div>
      </Section>
      {questions && (
        <Section title="Ask questions this month" className="max-w-[640px]">
          <span className="text-lg font-semibold">{askQuotaText(questions)}</span>
        </Section>
      )}
    </>
  );
}
