import { BILLING_STATES, type BillingState } from '@cs/db';
import { platformRole } from '@cs/tools';
import { formatUsd } from '@/components/billing/format';
import { StatCard } from '@/components/stat-card';
import { requireOperatorContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { platformAdmins } from '@/server/runtime-env';
import { callTool } from '@/server/tools';
import { BILLING_STATE_LABEL } from '../_components/billing-state-pill';
import { type CodeRow, Codes } from './codes';
import { InviteLinks, type LinkRow } from './invite-links';
import { PlanEditor, type PlanRow } from './plan-editor';

export const dynamic = 'force-dynamic';

const card = 'min-w-0 rounded-[14px] bg-surface p-6 shadow-card';

/**
 * Phase 9a console: MRR / paid seats / agencies by state, plan versions (owners edit), discount codes (owners manage) and
 * agency invite links (staff and owners; `list_invite_links` is staff-only so viewers never see the section).
 * A non-operator gets the tools' permission_denied → 404 (callTool).
 */
export default async function PlatformBillingPage() {
  const { ctx } = await requireOperatorContext();
  const role = await platformRole({ service: dbs().service, platformAdmins: platformAdmins() }, ctx);
  const isOwner = role === 'owner';
  const canInvite = role === 'owner' || role === 'staff';
  const [overview, { plans }, { codes }, links] = await Promise.all([
    callTool<{ mrrCents: number; paidSeats: number; agenciesByState: Record<string, number> }>(ctx, 'get_billing_overview', {}),
    callTool<{ plans: PlanRow[] }>(ctx, 'list_plans', {}),
    callTool<{ codes: (CodeRow & { code: string })[] }>(ctx, 'list_discount_codes', {}),
    canInvite ? callTool<{ links: LinkRow[] }>(ctx, 'list_invite_links', {}).then((r) => r.links) : Promise.resolve(null),
  ]);
  return (
    <div className="mx-auto flex w-full max-w-[1560px] flex-col gap-5">
      <h1 className="text-[26px] font-extrabold tracking-tight">Billing</h1>
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
        <h2 className="mb-3 font-semibold">Plans</h2>
        <PlanEditor plans={plans} canEdit={isOwner} />
      </section>
      <section className={card}>
        <h2 className="mb-3 font-semibold">Discount codes</h2>
        <Codes codes={codes} canManage={isOwner} />
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
