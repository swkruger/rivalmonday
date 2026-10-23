import { isAgencyRole } from '@cs/core';
import type { AlertQueueClient, AlertQueueRow } from '@cs/tools';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { assistantNameFor } from '@/server/ask';
import { requireContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';
import { AlertFilter, AlertList, CapNotice } from './alert-controls';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Alert review' };

const HELP_KEY = 'page:agency.alerts';
const COPY = PAGE_COPY['agency.alerts'];

export default async function AlertReviewPage({ searchParams }: { searchParams: Promise<{ client?: string | string[] }> }) {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const raw = (await searchParams).client;
  const picked = typeof raw === 'string' && z.string().uuid().safeParse(raw).success ? raw : null;
  const [{ items, capped, clients }, assistantName, guides] = await Promise.all([
    callTool<{ items: AlertQueueRow[]; capped: boolean; clients: AlertQueueClient[] }>(ctx, 'list_alert_queue', picked ? { clientId: picked } : {}),
    assistantNameFor(dbs().service, ctx.agencyId),
    helpGuides(ctx, 'agency'),
  ]);

  return (
    <>
      <PageHeader
        title="Alert review"
        breadcrumb={[{ label: 'Agency', href: '/agency' }, { label: 'Alert review' }]}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <TipRow
        items={[
          { label: 'Score', tip: 'agency.alerts.score' },
          { label: 'Digest', tip: 'agency.alerts.digest' },
          { label: 'Wording', tip: 'agency.alerts.template' },
        ]}
      />
      <AlertFilter clients={clients} selected={picked} selectedName={picked ? items.find((i) => i.clientId === picked)?.clientName ?? null : null} />
      <CapNotice capped={capped} filtered={picked !== null} />
      <AlertList items={items} assistantName={assistantName} nowMs={Date.now()} />
    </>
  );
}
