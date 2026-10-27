import { BILLING_STATES, type BillingState } from '@cs/db';
import { platformRole } from '@cs/tools';
import { Section, TabsLink, TabsLinkList } from '@cs/ui';
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

const HELP_KEY = 'page:platform.billing';
const COPY = PAGE_COPY['platform.billing'];

/** A billing section: its `?` tips sit beside the h2 (a sibling, so the heading's own name stays the title). */
function BillingSection({ title, tips, ruled, children }: { title: string; tips: ('plans' | 'codes' | 'restrict' | 'connect' | 'links' | 'signup')[]; ruled?: boolean; children: React.ReactNode }) {
  return (
    <Section
      title={title}
      ruled={ruled}
      titleAside={tips.length > 0 ? <>{tips.map((t) => <HelpTip key={t} tip={`platform.billing.${t}`} />)}</> : undefined}
    >
      {children}
    </Section>
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
        <StatStrip
          items={[
            { title: 'MRR', value: formatMoney(overview.mrrCents, { unit: 'cents' }), hint: 'From the latest daily stats' },
            { title: 'Paid seats', value: String(overview.paidSeats), hint: 'From the latest daily stats' },
          ]}
        />
        <Section title="Agencies by state">
          <StatStrip
            items={BILLING_STATES.map((s: BillingState) => ({
              title: labelFor(BILLING_STATE, s).label,
              value: String(overview.agenciesByState[s] ?? 0),
            }))}
          />
        </Section>
      </>
    );
  } else if (tab === 'plans') {
    const [{ plans }, behind] = await Promise.all([
      callTool<{ plans: PlanRow[] }>(ctx, 'list_plans', {}),
      callTool<PlanAgenciesData>(ctx, 'list_plan_agencies', {}),
    ]);
    body = (
      <>
        <BillingSection title="Plans" tips={['plans']}>
          <PlanEditor plans={plans} canEdit={isOwner} tz={tz} />
        </BillingSection>
        <BillingSection title="Agencies not on the current version" tips={[]} ruled>
          <PlanAgencies data={behind} canMove={isOwner} />
        </BillingSection>
      </>
    );
  } else if (tab === 'codes') {
    const { codes } = await callTool<{ codes: CodeRow[] }>(ctx, 'list_discount_codes', {});
    body = (
      <BillingSection title="Discount codes" tips={['codes', 'restrict']}>
        <Codes codes={codes} canManage={isOwner} tz={tz} />
      </BillingSection>
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
        <BillingSection title="Agency sign-up" tips={['signup']}>
          <SignupsPanel paused={signups.paused} canEdit={isOwner} days={days} funnel={funnel} />
        </BillingSection>
        {links && (
          <BillingSection title="Agency invite links" tips={['links']} ruled>
            <InviteLinks links={links} codes={codes.filter((c) => !c.revokedAt).map((c) => ({ id: c.id, code: c.code }))} tz={tz} />
          </BillingSection>
        )}
      </>
    );
  } else {
    const connect = await callTool<ConnectOverview>(ctx, 'get_connect_overview', {});
    body = (
      <BillingSection title="Stripe Connect" tips={['connect']}>
        <ConnectPanel overview={connect} canEdit={isOwner} />
      </BillingSection>
    );
  }

  return (
    <>
      <PageHeader
        title="Billing & plans"
        breadcrumb={[{ label: 'Platform', href: '/platform' }, { label: 'Billing & plans' }]}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
        tabs={
          <TabsLinkList aria-label="Billing sections" className="max-w-full overflow-x-auto">
            {TABS.map((t) => (
              <TabsLink key={t} asChild active={t === tab} className="flex-none px-3">
                <Link href={`/platform/billing?tab=${t}&days=${days}`}>{TAB_LABEL[t]}</Link>
              </TabsLink>
            ))}
          </TabsLinkList>
        }
      />
      {body}
    </>
  );
}
