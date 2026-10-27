import { BILLING_STATES, type BillingState } from '@cs/db';
import { platformRole } from '@cs/tools';
import { StatusChip, TabsLink, TabsLinkList } from '@cs/ui';
import Link from 'next/link';
import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { StatStrip } from '@/components/stat-strip';
import { PAGE_COPY } from '@/help/copy';
import { formatMoney } from '@/lib/format';
import { BILLING_STATE, labelFor } from '@/lib/labels';
import { requireOperatorContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { helpGuides } from '@/server/help';
import { platformAdmins } from '@/server/runtime-env';
import { callTool } from '@/server/tools';
import { viewerTimeZone } from '@/server/viewer-tz';
import { type CodeRow, Codes } from './codes';
import { ConnectPanel, type ConnectOverview } from './connect-panel';
import { InviteLinks, type LinkRow } from './invite-links';
import { type PlanAgenciesData, PlanAgencies } from './plan-agencies';
import { PlanEditor, type PlanRow } from './plan-editor';
import { parseDays, type SignupFunnel, SignupsPanel } from './signups-panel';
import { billingTab, TAB_LABEL, TABS } from './tabs';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Billing & plans' };

const card = 'min-w-0 rounded-md border border-line bg-surface p-6';
const HELP_KEY = 'page:platform.billing';
const COPY = PAGE_COPY['platform.billing'];

/** A section heading with its `?` tip beside it (a sibling of the h2, so the heading's own name stays the title). */
function SectionHead({ title, tips }: { title: string; tips: ('plans' | 'codes' | 'restrict' | 'connect' | 'links' | 'signup')[] }) {
  return (
    <div className="mb-3 flex items-center gap-1.5">
      <h2 className="font-semibold">{title}</h2>
      {tips.map((t) => (
        <HelpTip key={t} tip={`platform.billing.${t}`} />
      ))}
    </div>
  );
}

/**
 * Phase 9a console in tabs (15c-2a): Overview (MRR, paid seats, agencies by state), Plans (owners edit), Discount codes (owners manage),
 * Sign-up & invites (open sign-up switch, funnel, agency invite links for staff and owners; `list_invite_links` is staff-only so viewers never
 * see them) and Stripe Connect. Only the open tab's tools run. A non-operator gets the tools' permission_denied -> 404 (callTool).
 */
export default async function PlatformBillingPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const sp = await searchParams;
  const days = parseDays(sp?.days);
  const tab = billingTab(sp?.tab);
  const { ctx } = await requireOperatorContext();
  const role = await platformRole({ service: dbs().service, platformAdmins: platformAdmins() }, ctx);
  const isOwner = role === 'owner';
  const canInvite = role === 'owner' || role === 'staff';
  const [tz, guides] = await Promise.all([viewerTimeZone(), helpGuides(ctx, 'platform')]);

  let body: React.ReactNode;
  if (tab === 'overview') {
    const overview = await callTool<{ mrrCents: number; paidSeats: number; agenciesByState: Record<string, number> }>(ctx, 'get_billing_overview', {});
    body = (
      <>
        <TipRow
          items={[
            { label: 'About MRR', tip: 'platform.billing.money' },
            { label: 'About billing states', tip: 'platform.agencies.billing' },
          ]}
        />
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          <div className="col-span-2">
            <StatStrip
              items={[
                { title: 'MRR', value: formatMoney(overview.mrrCents, { unit: 'cents' }), hint: 'From the latest daily stats' },
                { title: 'Paid seats', value: String(overview.paidSeats), hint: 'From the latest daily stats' },
              ]}
            />
          </div>
          <div className="col-span-2 rounded-md border border-line bg-surface p-6">
            <h3 className="text-sm font-semibold text-muted-foreground">Agencies by state</h3>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-3 text-sm">
              {BILLING_STATES.map((s: BillingState) => {
                const entry = labelFor(BILLING_STATE, s);
                return (
                  <li key={s} className="flex flex-col items-start gap-1">
                    <StatusChip tone={entry.tone}>{entry.label}</StatusChip>
                    <span className="text-xl font-semibold text-secondary">{overview.agenciesByState[s] ?? 0}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </>
    );
  } else if (tab === 'plans') {
    const [{ plans }, behind] = await Promise.all([
      callTool<{ plans: PlanRow[] }>(ctx, 'list_plans', {}),
      callTool<PlanAgenciesData>(ctx, 'list_plan_agencies', {}),
    ]);
    body = (
      <>
        <section className={card}>
          <SectionHead title="Plans" tips={['plans']} />
          <PlanEditor plans={plans} canEdit={isOwner} tz={tz} />
        </section>
        <section className={card}>
          <SectionHead title="Agencies not on the current version" tips={[]} />
          <PlanAgencies data={behind} canMove={isOwner} />
        </section>
      </>
    );
  } else if (tab === 'codes') {
    const { codes } = await callTool<{ codes: CodeRow[] }>(ctx, 'list_discount_codes', {});
    body = (
      <section className={card}>
        <SectionHead title="Discount codes" tips={['codes', 'restrict']} />
        <Codes codes={codes} canManage={isOwner} tz={tz} />
      </section>
    );
  } else if (tab === 'signups') {
    const [signups, funnel, links, codes] = await Promise.all([
      callTool<{ paused: boolean }>(ctx, 'get_signups_paused', {}),
      callTool<SignupFunnel>(ctx, 'get_signup_funnel', { days }),
      canInvite ? callTool<{ links: LinkRow[] }>(ctx, 'list_invite_links', {}).then((r) => r.links) : Promise.resolve(null),
      canInvite ? callTool<{ codes: CodeRow[] }>(ctx, 'list_discount_codes', {}).then((r) => r.codes) : Promise.resolve([] as CodeRow[]),
    ]);
    body = (
      <>
        <section className={card}>
          <SectionHead title="Agency sign-up" tips={['signup']} />
          <SignupsPanel paused={signups.paused} canEdit={isOwner} days={days} funnel={funnel} />
        </section>
        {links && (
          <section className={card}>
            <SectionHead title="Agency invite links" tips={['links']} />
            <InviteLinks links={links} codes={codes.filter((c) => !c.revokedAt).map((c) => ({ id: c.id, code: c.code }))} tz={tz} />
          </section>
        )}
      </>
    );
  } else {
    const connect = await callTool<ConnectOverview>(ctx, 'get_connect_overview', {});
    body = (
      <section className={card}>
        <SectionHead title="Stripe Connect" tips={['connect']} />
        <ConnectPanel overview={connect} canEdit={isOwner} />
      </section>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1560px] flex-col gap-5">
      <PageHeader
        title="Billing & plans"
        breadcrumb={[{ label: 'Platform', href: '/platform' }, { label: 'Billing & plans' }]}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <TabsLinkList aria-label="Billing sections" className="max-w-full self-start overflow-x-auto">
        {TABS.map((t) => (
          <TabsLink key={t} asChild active={t === tab} className="flex-none px-3">
            <Link href={`/platform/billing?tab=${t}&days=${days}`}>{TAB_LABEL[t]}</Link>
          </TabsLink>
        ))}
      </TabsLinkList>
      {body}
    </div>
  );
}
