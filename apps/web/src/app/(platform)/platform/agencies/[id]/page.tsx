import { ARCHIVE_BILLING_MESSAGE, platformRole } from '@cs/tools';
import { Band, HairlineGrid, Section, StatusChip, TableFrame } from '@cs/ui';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { cache } from 'react';
import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { StatStrip } from '@/components/stat-strip';
import { type SupportSessionRow, SupportSessionsTable } from '@/components/support-sessions-table';
import { formatDate, formatMoney } from '@/lib/format';
import { AGENCY_HEALTH, AGENCY_LIFECYCLE, labelFor } from '@/lib/labels';
import { PAGE_COPY } from '@/help/copy';
import { requireOperatorContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { helpGuides } from '@/server/help';
import { platformAdmins } from '@/server/runtime-env';
import { callTool } from '@/server/tools';
import { viewerTimeZone } from '@/server/viewer-tz';
import { deltaPill, PlatformCharts, type Point, type Tile } from '../../_components/overview-charts';
import { parseRange, RangeToggle } from '../../_components/range-toggle';
import { type AgencyClientRow, ArchivedView, ClientsSection } from './archived-view';
import type { PlanAgencyRow } from '../../_components/plan-move-parts';
import { type AgencyBilling, BillingPanel } from './billing-panel';
import { type ClientLimits, ClientLimitsTable } from './client-limits';
import { HoldBanner, HoldChip } from './hold-banner';
import { ManageMenu, UnarchiveButton } from './manage-menu';
import { type AgencyPeople, PeopleSection, type PeopleTab } from './people-section';
import { SupportDialog } from './support-dialog';

export const dynamic = 'force-dynamic';

const HELP_KEY = 'page:platform.agencies.detail';
const COPY = PAGE_COPY['platform.agencies.detail'];

type Health = 'at_risk' | 'idle' | 'growing' | 'steady';
type Tiles = { agencies: Tile; clientsActive: Tile; seats: Tile; wau: Tile; spendMonthUsd: Tile };

/** `get_platform_agency` output; `health`, `tiles` and `series` are null for an archived agency. */
interface Detail {
  agency: { id: string; name: string; createdAt: string; health: Health | null };
  tiles: Tiles | null;
  series: Point[] | null;
  hold: { since: string; reason: string; byName: string } | null;
  archivedAt: string | null;
  holdBillingIssue: 'pause' | 'resume' | null;
  archiveBlockers: { agencyPlan: boolean; clientSubscriptions: number };
  clients: AgencyClientRow[];
}

const PEOPLE_TABS: readonly PeopleTab[] = ['team', 'clients', 'invites'];
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

type Range = ReturnType<typeof parseRange>;
interface Props { params: Promise<{ id: string }>; searchParams: Promise<{ range?: string | string[]; ended?: string | string[]; people?: string | string[] }> }

/** One detail read per request, shared by the tab title and the page. */
const loadAgency = cache(async (agencyId: string, range: Range) => {
  const { ctx } = await requireOperatorContext();
  return callTool<Detail>(ctx, 'get_platform_agency', { agencyId, range });
});

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { agency } = await loadAgency((await params).id, parseRange((await searchParams).range));
  return { title: agency.name };
}

/**
 * The archive refusal (R1): `ARCHIVE_BILLING_MESSAGE` plus what is still live, from `archiveBlockers`; null when nothing is.
 * The tool re-checks on confirm.
 */
function archiveRefusal({ agencyPlan, clientSubscriptions: n }: Detail['archiveBlockers']): string | null {
  if (!agencyPlan && n <= 0) return null;
  const subs = `${n} client ${n === 1 ? 'subscription' : 'subscriptions'}`;
  const tail = agencyPlan ? (n > 0 ? `Its plan and ${subs} are still active.` : 'Its plan is still active.') : `${subs} ${n === 1 ? 'is' : 'are'} still active.`;
  return `${ARCHIVE_BILLING_MESSAGE} ${tail}`;
}

/** `?people=` tab links; `range` is kept, the default tab has no param. */
function peopleHrefs(agencyId: string, range: string | undefined): Record<PeopleTab, string> {
  const href = (t: PeopleTab) => {
    const q = new URLSearchParams();
    if (range) q.set('range', range);
    if (t !== 'team') q.set('people', t);
    const qs = q.toString();
    return `/platform/agencies/${agencyId}${qs ? `?${qs}` : ''}`;
  };
  return { team: href('team'), clients: href('clients'), invites: href('invites') };
}

/**
 * Unknown/malformed id or a non-operator → the tool's not_found / permission_denied → 404 (callTool).
 * Phase 8b: "View as agency" (owner/staff only), recent support sessions, and the `?ended=1` flash after Exit/expiry.
 * Phase 15c-3a: Manage menu (staff+), People (`?people=`), the hold chip and billing-issue banner, and, for an archived
 * agency (R10), only the archived view: no hold chip or banner, and none of the other sections' reads.
 */
export default async function PlatformAgencyPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const range = parseRange(sp.range);
  const { ctx } = await requireOperatorContext();
  const { agency, tiles, series, hold, archivedAt, holdBillingIssue, archiveBlockers, clients } = await loadAgency(id, range);
  const [people, role, guides, tz] = await Promise.all([
    callTool<AgencyPeople>(ctx, 'list_agency_people', { agencyId: agency.id }),
    platformRole({ service: dbs().service, platformAdmins: platformAdmins() }, ctx),
    helpGuides(ctx, 'platform'),
    viewerTimeZone(),
  ]);
  const canStart = role === 'owner' || role === 'staff';
  const nowMs = Date.now();
  const peopleParam = one(sp.people);
  const peopleTab: PeopleTab = PEOPLE_TABS.find((t) => t === peopleParam) ?? 'team';
  const hrefs = peopleHrefs(agency.id, one(sp.range));
  const ref = { id: agency.id, name: agency.name };
  const header = (meta: ReactNode, actions: ReactNode, after?: string) => (
    <PageHeader
      title={agency.name}
      breadcrumb={[{ label: 'Platform', href: '/platform' }, { label: 'Agencies', href: '/platform/agencies' }, { label: agency.name }]}
      description={
        <>
          <HelpText text={COPY.description} /> Created {formatDate(agency.createdAt, { tz })}.{after ? ` ${after}` : ''}
        </>
      }
      helpKey={HELP_KEY}
      guide={guides.has(HELP_KEY)}
      meta={meta}
      actions={actions}
    />
  );

  if (archivedAt) {
    const archived = AGENCY_LIFECYCLE.archived;
    return (
      <>
        {header(
          <StatusChip tone={archived.tone}>{archived.label}</StatusChip>,
          role === 'owner' ? <UnarchiveButton agency={ref} /> : null,
          `Archived ${formatDate(archivedAt, { tz })}.`,
        )}
        <TipRow
          items={[
            { label: 'About people', tip: 'platform.agencies.detail.people' },
            { label: 'About archiving', tip: 'platform.agencies.detail.archive' },
          ]}
        />
        <ArchivedView agency={ref} people={people} tab={peopleTab} hrefs={hrefs} clients={clients} tz={tz} nowMs={nowMs} />
      </>
    );
  }

  const [{ rows: sessions }, limits, billing, codes, planList] = await Promise.all([
    callTool<{ rows: SupportSessionRow[] }>(ctx, 'list_agency_support_sessions', { agencyId: agency.id }),
    callTool<ClientLimits>(ctx, 'get_client_limits', { agencyId: agency.id }),
    callTool<AgencyBilling>(ctx, 'get_agency_billing', { agencyId: agency.id }),
    canStart
      ? callTool<{ codes: { id: string; code: string; revokedAt: string | null }[] }>(ctx, 'list_discount_codes', {}).then((r) => r.codes.filter((c) => !c.revokedAt))
      : Promise.resolve([]),
    // Optional: a failed read (e.g. `conflict`, no current plan) drops only the "(current: v{N})" note and the Move item.
    callTool<{ currentVersion: number; agencies: PlanAgencyRow[] }>(ctx, 'list_plan_agencies', {}).catch(() => null),
  ]);
  // The agency has a row here only when it is behind the current plan version (a null version = never set).
  const behindRow = planList?.agencies.find((a) => a.agencyId === agency.id) ?? null;
  const behind = planList && behindRow ? { version: behindRow.version, currentVersion: planList.currentVersion } : null;
  const planMove = planList && behindRow && !hold && behindRow.state !== 'cancelled' ? { row: behindRow, currentVersion: planList.currentVersion } : null;
  const health = agency.health ? labelFor(AGENCY_HEALTH, agency.health) : null;
  // The tool returns tiles and series for every agency that is not archived.
  const t = tiles as Tiles;
  return (
    <>
      {header(
        <>
          {hold && <HoldChip reason={hold.reason} since={formatDate(hold.since, { tz })} byName={hold.byName} />}
          {health && <StatusChip tone={health.tone}>{health.label}</StatusChip>}
        </>,
        <>
          {canStart && <SupportDialog agencyId={agency.id} />}
          {canStart && <ManageMenu agency={ref} role={role} held={hold !== null} archiveRefusal={archiveRefusal(archiveBlockers)} planMove={planMove} />}
        </>,
      )}
      {sp.ended === '1' && (
        <Band tone="muted" role="status" className="p-3 text-ink">
          Support session ended.
        </Band>
      )}
      {holdBillingIssue && (
        <HoldBanner agencyId={agency.id} issue={holdBillingIssue} canRetry={canStart} hold={hold ? { since: formatDate(hold.since, { tz }), byName: hold.byName } : null} />
      )}
      <TipRow
        items={[
          { label: 'About health', tip: 'platform.agencies.health' },
          { label: 'About support sessions', tip: 'platform.agencies.detail.support' },
          { label: 'About people', tip: 'platform.agencies.detail.people' },
          { label: 'About holds', tip: 'platform.agencies.detail.hold' },
          { label: 'About archiving', tip: 'platform.agencies.detail.archive' },
          { label: 'About the billing panel', tip: 'platform.agencies.detail.billingPanel' },
        ]}
      />
      <StatStrip
        items={[
          { title: 'Active clients', value: String(t.clientsActive.value), pill: deltaPill(t.clientsActive), hint: 'Last 28 days' },
          { title: 'Seats', value: String(t.seats.value), pill: deltaPill(t.seats), hint: 'Last 28 days' },
          { title: 'Weekly active users', value: String(t.wau.value), pill: deltaPill(t.wau), hint: 'Last 28 days' },
          { title: 'Spend this month', value: formatMoney(t.spendMonthUsd.value, { cents: true }), pill: deltaPill(t.spendMonthUsd, (n: number) => formatMoney(n, { cents: true })), hint: 'Last 28 days' },
        ]}
      />
      <HairlineGrid cols={2}>
        <PlatformCharts series={series ?? []} range={range} includeAgencies={false} rangeToggle={<RangeToggle current={range} basePath={`/platform/agencies/${agency.id}`} />} />
      </HairlineGrid>
      <PeopleSection agency={ref} people={people} tab={peopleTab} hrefs={hrefs} canManage={canStart} tz={tz} nowMs={nowMs} />
      <ClientsSection clients={clients} tz={tz} />
      <Section ruled title="Client limits" titleAside={<HelpTip tip="platform.agencies.detail.clientLimits" />}>
        <ClientLimitsTable data={limits} canEdit={canStart} />
      </Section>
      <Section ruled title="Billing">
        <BillingPanel billing={billing} role={role ?? 'viewer'} codes={codes.map((c) => ({ id: c.id, code: c.code }))} tz={tz} behind={behind} />
      </Section>
      <Section ruled title="Support sessions">
        {sessions.length === 0 ? (
          <SupportSessionsTable rows={sessions} empty="No support sessions yet." tz={tz} />
        ) : (
          <TableFrame>
            <SupportSessionsTable rows={sessions} empty="No support sessions yet." tz={tz} />
          </TableFrame>
        )}
      </Section>
    </>
  );
}
