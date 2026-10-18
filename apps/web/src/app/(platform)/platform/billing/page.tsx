import { BILLING_STATES, type BillingState } from '@cs/db';
import { platformRole } from '@cs/tools';
import { formatUsd } from '@/components/billing/format';
import { StatCard } from '@/components/stat-card';
import { PageHeader } from '@/components/page-header';
import { requireOperatorContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { platformAdmins } from '@/server/runtime-env';
import { callTool } from '@/server/tools';
import { BILLING_STATE_LABEL } from '../_components/billing-state-pill';
import { type CodeRow, Codes } from './codes';
import { ConnectPanel, type ConnectOverview } from './connect-panel';
import { InviteLinks, type LinkRow } from './invite-links';
import { PlanEditor, type PlanRow } from './plan-editor';
import { parseDays, type SignupFunnel, SignupsPanel } from './signups-panel';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Billing & plans' };

const card = 'min-w-0 rounded-[14px] bg-surface p-6 shadow-card';

/**
 * Phase 9a console: MRR / paid seats / agencies by state, plan versions (owners edit), discount codes (owners manage) Stripe Connect (overview for every operator, fee forms for owners) and
 * agency invite links (staff and owners; `list_invite_links` is staff-only so viewers never see the section).
 * A non-operator gets the tools' permission_denied → 404 (callTool).
 */
export default async function PlatformBillingPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const days = parseDays((await searchParams)?.days);
  const { ctx } = await requireOperatorContext();
  const role = await platformRole({ service: dbs().service, platformAdmins: platformAdmins() }, ctx);
  const isOwner = role === 'owner';
  const canInvite = role === 'owner' || role === 'staff';
  const [overview, { plans }, { codes }, links, connect, signups, funnel] = await Promise.all([
    callTool<{ mrrCents: number; paidSeats: number; agenciesByState: Record<string, number> }>(ctx, 'get_billing_overview', {}),
    callTool<{ plans: PlanRow[] }>(ctx, 'list_plans', {}),
    callTool<{ codes: (CodeRow & { code: string })[] }>(ctx, 'list_discount_codes', {}),
    canInvite ? callTool<{ links: LinkRow[] }>(ctx, 'list_invite_links', {}).then((r) => r.links) : Promise.resolve(null),
    callTool<ConnectOverview>(ctx, 'get_connect_overview', {}),
    callTool<{ paused: boolean }>(ctx, 'get_signups_paused', {}),
    callTool<SignupFunnel>(ctx, 'get_signup_funnel', { days }),
  ]);
  return (
    <div className="mx-auto flex w-full max-w-[1560px] flex-col gap-5">
      <PageHeader title="Billing & plans" breadcrumb={[{ label: 'Platform', href: '/platform' }, { label: 'Billing & plans' }]} />
      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        <StatCard title="MRR" value={formatUsd(overview.mrrCents)} hint="From the latest daily stats" />
        <StatCard title="Paid seats" value={String(overview.paidSeats)} hint="From the latest daily stats" />
        <div className="col-span-2 rounded-[14px] bg-surface p-6 shadow-card">
          <h3 className="text-sm font-semibold text-muted-foreground">Agencies by state</h3>
          <dl className="mt-3 grid grid-cols-4 gap-3 text-sm sm:grid-cols-7">
            {BILLING_STATES.map((s: BillingState) => (
              <div key={s}>
                <dt className="text-muted-foreground">{BILLING_STATE_LABEL[s]}</dt>
                <dd className="text-xl font-extrabold text-secondary">{overview.agenciesByState[s] ?? 0}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <section className={card}>
        <h2 className="mb-3 font-semibold">Agency sign-up</h2>
        <SignupsPanel paused={signups.paused} canEdit={isOwner} days={days} funnel={funnel} />
      </section>
      <section className={card}>
        <h2 className="mb-3 font-semibold">Plans</h2>
        <PlanEditor plans={plans} canEdit={isOwner} />
      </section>
      <section className={card}>
        <h2 className="mb-3 font-semibold">Discount codes</h2>
        <Codes codes={codes} canManage={isOwner} />
      </section>
      <section className={card}>
        <h2 className="mb-3 font-semibold">Stripe Connect</h2>
        <ConnectPanel overview={connect} canEdit={isOwner} />
      </section>
      {links && (
        <section className={card}>
          <h2 className="mb-3 font-semibold">Agency invite links</h2>
          <InviteLinks links={links} codes={codes.filter((c) => !c.revokedAt).map((c) => ({ id: c.id, code: c.code }))} />
        </section>
      )}
    </div>
  );
}
