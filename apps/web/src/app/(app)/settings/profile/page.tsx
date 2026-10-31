import { Section } from '@cs/ui';
import { notFound } from 'next/navigation';
import { HelpText } from '@/components/help/help-context';
import { PageHeader } from '@/components/page-header';
import { showsClientBilling } from '@/components/shell/nav-items';
import { PAGE_COPY } from '@/help/copy';
import { clientBillingNoticeOf } from '@/server/client-billing-state';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';
import { NotificationLists } from '../notifications/notification-lists';
import { AvatarControl } from './avatar-control';
import { ClientSummaries } from './client-summaries';
import { DetailsForm } from './details-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Profile' };

const HELP_KEY = 'page:account.settings.profile';
const COPY = PAGE_COPY['account.settings.profile'];

export default async function ProfilePage() {
  const { viewer, ctx } = await requireContext();
  if (viewer.kind !== 'user') notFound();
  // /settings/profile is outside /agency, /c and /platform, so the guide drawer reads the agency scope (helpScopeOf); read the same one here.
  const [profile, notifications, guides] = await Promise.all([
    callTool<{ name: string; email: string; avatarUrl: string | null }>(ctx, 'get_my_profile', {}),
    callTool<{ lists: React.ComponentProps<typeof NotificationLists>['lists'] }>(ctx, 'get_my_notification_settings', {}),
    helpGuides(ctx, 'agency'),
  ]);

  // Client roles have exactly one client; no single client, no "Your business" section.
  const clientId = ctx.clientScope !== 'all' && ctx.clientScope.length === 1 ? ctx.clientScope[0]! : null;
  const billingEnabled = showsClientBilling(ctx.role, await clientBillingNoticeOf(ctx));

  return (
    <>
      <PageHeader
        title="Profile"
        breadcrumb={[{ label: 'Profile' }]}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <Section title="Your details" className="max-w-[640px]">
        <AvatarControl name={profile.name} email={profile.email} avatarUrl={profile.avatarUrl} />
        <DetailsForm name={profile.name} email={profile.email} />
      </Section>
      {clientId && <ClientSummaries ctx={ctx} clientId={clientId} billingEnabled={billingEnabled} />}
      <section id="notifications" className="scroll-mt-20 flex flex-col gap-6">
        <NotificationLists lists={notifications.lists} />
      </section>
    </>
  );
}
