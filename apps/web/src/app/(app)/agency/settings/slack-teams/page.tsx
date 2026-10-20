import { listWebhooks } from '@cs/tools';
import { Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { WriteGuard } from '@/components/read-only';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { requireContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { helpGuides } from '@/server/help';
import { AddWebhookForm, WebhookToggle } from './webhook-controls';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Slack & Teams' };

const HELP_KEY = 'page:agency.settings.slack-teams';
const COPY = PAGE_COPY['agency.settings.slack-teams'];

const KIND_LABEL: Record<string, string> = { slack: 'Slack', teams: 'Teams' };

export default async function WebhooksPage() {
  const { ctx } = await requireContext();
  if (ctx.role !== 'agency_admin') notFound();
  const [webhooks, guides] = await Promise.all([listWebhooks(dbs().service, ctx), helpGuides(ctx, 'agency')]);

  return (
    <>
      <PageHeader
        title="Slack & Teams"
        breadcrumb={[{ label: 'Agency settings', href: '/agency/settings' }, { label: 'Slack & Teams' }]}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <Card>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-1.5">
            Webhooks
            <HelpTip tip="agency.settings.slack-teams.how" />
            <HelpTip tip="agency.settings.slack-teams.kinds" />
            <HelpTip tip="agency.settings.slack-teams.secret" />
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {webhooks.length === 0 ? (
            <EmptyState {...COPY.empty.noWebhooks} guideAnchor="how-to-use-it" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kind</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead>Notices</TableHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1.5">
                      Active
                      <HelpTip tip="agency.settings.slack-teams.off" />
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhooks.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">{KIND_LABEL[w.kind] ?? w.kind}</TableCell>
                    <TableCell>{w.host}</TableCell>
                    <TableCell>{w.kinds && w.kinds.length ? w.kinds.join(', ') : 'All agency notices'}</TableCell>
                    <TableCell>
                      <WebhookToggle id={w.id} active={w.active} label={`${KIND_LABEL[w.kind] ?? w.kind} webhook active`} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <WriteGuard>
            <div className="border-t border-line pt-5">
              <AddWebhookForm />
            </div>
          </WriteGuard>
        </CardContent>
      </Card>
    </>
  );
}
