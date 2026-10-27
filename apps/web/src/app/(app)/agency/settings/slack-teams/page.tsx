import type { WebhookView } from '@cs/tools';
import { Section, TableFrame } from '@cs/ui';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { WriteGuard } from '@/components/read-only';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';
import { AddWebhookForm, WebhookTable } from './webhook-controls';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Slack & Teams' };

const HELP_KEY = 'page:agency.settings.slack-teams';
const COPY = PAGE_COPY['agency.settings.slack-teams'];

export default async function WebhooksPage() {
  const { ctx } = await requireContext();
  if (ctx.role !== 'agency_admin') notFound();
  const [{ items: webhooks }, guides] = await Promise.all([callTool<{ items: WebhookView[] }>(ctx, 'list_webhooks', {}), helpGuides(ctx, 'agency')]);

  return (
    <>
      <PageHeader
        title="Slack & Teams"
        breadcrumb={[{ label: 'Agency settings', href: '/agency/settings' }, { label: 'Slack & Teams' }]}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <Section
        title="Webhooks"
        titleAside={
          <>
            <HelpTip tip="agency.settings.slack-teams.how" />
            <HelpTip tip="agency.settings.slack-teams.kinds" />
            <HelpTip tip="agency.settings.slack-teams.secret" />
          </>
        }
      >
        {webhooks.length === 0 ? (
          <EmptyState {...COPY.empty.noWebhooks} guideAnchor="how-to-use-it" />
        ) : (
          <TableFrame>
            <WebhookTable
              webhooks={webhooks.map(({ id, kind, host, kinds, active }) => ({ id, kind, host, kinds, active }))}
              activeHeader={
                <span className="inline-flex items-center gap-1.5">
                  Active
                  <HelpTip tip="agency.settings.slack-teams.off" />
                </span>
              }
            />
          </TableFrame>
        )}
        <WriteGuard>
          <div className="border-t border-line pt-5">
            <AddWebhookForm />
          </div>
        </WriteGuard>
      </Section>
    </>
  );
}
