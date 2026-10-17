import { isAgencyRole } from '@cs/core';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { verticalOptions } from '@/server/verticals';
import { LeadCard, type LeadPreview, type LeadView } from './lead-card';

export const dynamic = 'force-dynamic';

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
}

const TABS = [
  { key: 'new', label: 'New', status: 'verified' },
  { key: 'accepted', label: 'Accepted', status: 'accepted' },
  { key: 'declined', label: 'Declined', status: 'declined' },
] as const satisfies readonly { key: string; label: string; status: Status }[];

const EMPTY: Record<(typeof TABS)[number]['key'], string> = {
  new: 'No new leads. Share your intake link to start getting them.',
  accepted: 'No accepted leads yet.',
  declined: 'No declined leads.',
};

const iso = (d: Date | string | null): string => (d ? new Date(d).toISOString() : new Date(0).toISOString());
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Phase 11c §5: agency admins and all-clients account managers; any other viewer gets a 404 (the tool refuses them too). */
export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role) || ctx.clientScope !== 'all') notFound();
  const tabKey = one((await searchParams).tab);
  const tab = TABS.find((t) => t.key === tabKey) ?? TABS[0];
  const { leads: all } = await callTool<{ leads: Summary[] }>(ctx, 'list_leads', {});
  const counts: Record<Status, number> = { verified: 0, accepted: 0, declined: 0 };
  for (const l of all) counts[l.status] += 1;
  const shown = all.filter((l) => l.status === tab.status);
  const verticals = await verticalOptions();
  // The suggested service type only matters while a lead is undecided.
  const suggested = new Map<string, string | null>();
  if (tab.status === 'verified') {
    await Promise.all(shown.map(async (l) => {
      const d = await callTool<{ suggestedVerticalId: string | null }>(ctx, 'get_lead', { leadId: l.id });
      suggested.set(l.id, d.suggestedVerticalId);
    }));
  }
  const views: LeadView[] = shown.map((l) => ({
    id: l.id, source: l.source, status: l.status, ref: l.ref, businessName: l.businessName, address: l.address, contactName: l.contactName,
    email: l.email, phone: l.phone, message: l.message, preview: l.preview, clientId: l.clientId,
    when: iso(l.status === 'verified' ? l.verifiedAt ?? l.createdAt : l.decidedAt ?? l.createdAt), suggestedVerticalId: suggested.get(l.id) ?? null,
  }));

  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">Leads</h1>
      <p className="text-muted-foreground">Businesses that asked for a competitor snapshot. Accept one to set it up as a prospect and invite the contact.</p>
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
        <p className="text-muted-foreground">{EMPTY[tab.key]}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {views.map((v) => (
            <LeadCard key={v.id} lead={v} verticals={verticals} platformName="the platform" />
          ))}
        </div>
      )}
    </>
  );
}
