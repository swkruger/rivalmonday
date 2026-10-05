import { listWebhooks } from '@cs/tools';
import { Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { AddWebhookForm, WebhookToggle } from './webhook-controls';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = { slack: 'Slack', teams: 'Teams' };

export default async function WebhooksPage() {
  const { ctx } = await requireContext();
  if (ctx.role !== 'agency_admin') notFound();
  const webhooks = await listWebhooks(dbs().service, ctx);

  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">Slack &amp; Teams</h1>
      <p className="text-muted-foreground">Post agency notices to a Slack or Teams channel.</p>
      <Card>
        <CardHeader>
          <CardTitle>Webhooks</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {webhooks.length === 0 ? (
            <p className="text-muted-foreground">No webhooks yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kind</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead>Notices</TableHead>
                  <TableHead>Active</TableHead>
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
          <div className="border-t border-line pt-5">
            <AddWebhookForm />
          </div>
        </CardContent>
      </Card>
    </>
  );
}
