import { isAgencyRole } from '@cs/core';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';
import { verticalOptions } from '@/server/verticals';
import { createVerticalAction, draftVerticalAction } from '../clients/new/vertical-actions';
import { LeadCard, type LeadPreview, type LeadView } from './lead-card';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Leads' };

type Status = 'verified' | 'accepted' | 'declined';
interface Summary {
  id: string;
  source: 'agency_link' | 'platform';
  status: Status;
  ref: string | null;
  businessName: string;
  address: string | null;
  contactName: string;
  email: string;
  phone: string | null;
  message: string | null;
  preview: LeadPreview;
  verifiedAt: Date | string | null;
  decidedAt: Date | string | null;
  createdAt: Date | string;
  clientId: string | null;
  suggestedVerticalId: string | null;
  placeId: string;
  category: string | null;
}

const TABS = [
  { key: 'new', label: 'New', status: 'verified' },
  { key: 'accepted', label: 'Accepted', status: 'accepted' },
  { key: 'declined', label: 'Declined', status: 'declined' },
] as const satisfies readonly { key: string; label: string; status: Status }[];

const HELP_KEY = 'page:agency.leads';
const COPY = PAGE_COPY['agency.leads'];
const EMPTY: Record<(typeof TABS)[number]['key'], { title: string; body: string }> = {
  new: COPY.empty.newLeads,
  accepted: COPY.empty.accepted,
  declined: COPY.empty.declined,
};

const iso = (d: Date | string | null): string => (d ? new Date(d).toISOString() : new Date(0).toISOString());
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Phase 11c §5: agency admins and all-clients account managers; any other viewer gets a 404 (the tool refuses them too). */
export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role) || ctx.clientScope !== 'all') notFound();
  const tabKey = one((await searchParams).tab);
  const tab = TABS.find((t) => t.key === tabKey) ?? TABS[0];
  // One status-filtered read per tab (a single unfiltered list would drop older New leads past the tool's cap while the badge counts them).
  const [guides, lists] = await Promise.all([helpGuides(ctx, 'agency'), Promise.all(TABS.map((t) => callTool<{ leads: Summary[] }>(ctx, 'list_leads', { status: t.status })))]);
  const counts = Object.fromEntries(TABS.map((t, i) => [t.status, lists[i]!.leads.length])) as Record<Status, number>;
  const shown = lists[TABS.indexOf(tab)]!.leads;
  const verticals = await verticalOptions();
  const views: LeadView[] = shown.map((l) => ({
    id: l.id, source: l.source, status: l.status, ref: l.ref, businessName: l.businessName, address: l.address, contactName: l.contactName,
    email: l.email, phone: l.phone, message: l.message, preview: l.preview, clientId: l.clientId,
    when: iso(l.status === 'verified' ? l.verifiedAt ?? l.createdAt : l.decidedAt ?? l.createdAt), suggestedVerticalId: l.suggestedVerticalId,
    lookup: { placeId: l.placeId, category: l.category },
  }));

  return (
    <>
      <PageHeader
        title="Leads"
        breadcrumb={[{ label: 'Agency', href: '/agency' }, { label: 'Leads' }]}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <TipRow
        items={[
          { label: 'Tabs', tip: 'agency.leads.tabs' },
          { label: 'Sources', tip: 'agency.leads.source' },
          { label: 'Deciding', tip: 'agency.leads.decide' },
          { label: 'Snapshots', tip: 'agency.leads.preview' },
        ]}
      />
      <nav aria-label="Lead status" className="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === 'new' ? '/agency/leads' : `/agency/leads?tab=${t.key}`}
            aria-current={t.key === tab.key ? 'page' : undefined}
            className={t.key === tab.key ? 'border-b-2 border-primary px-3 py-2 text-sm font-semibold text-primary-soft-text' : 'px-3 py-2 text-sm font-medium text-ink/70 hover:text-ink'}
          >
            {t.label} <span className="text-muted-foreground">({counts[t.status]})</span>
          </Link>
        ))}
      </nav>
      {views.length === 0 ? (
        <EmptyState title={EMPTY[tab.key].title} body={EMPTY[tab.key].body} guideAnchor="how-to-use-it" />
      ) : (
        <div className="flex flex-col gap-4">
          {views.map((v) => (
            <LeadCard key={v.id} lead={v} verticals={verticals} verticalActions={{ draft: draftVerticalAction, create: createVerticalAction }} />
          ))}
        </div>
      )}
    </>
  );
}
