import { listInbox } from '@cs/tools';
import { Button, Card, CardContent } from '@cs/ui';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { requireContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { inboxOwnerFor, NOTIFICATION_KIND_LABELS } from '@/server/inbox';
import { markAllReadAction, openNotification } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Inbox' };

function formatWhen(d: Date): string {
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default async function InboxPage() {
  const { viewer, ctx } = await requireContext();
  // Phase 8b R9: the inbox is the operator's own (personal) notifications, not the agency's — hidden in a session.
  if (ctx.support) notFound();
  const items = await listInbox(dbs().service, inboxOwnerFor(viewer), { limit: 100 });
  return (
    <>
      <PageHeader
        title="Inbox"
        breadcrumb={[{ label: 'Inbox' }]}
        actions={
          <form action={markAllReadAction}>
            <Button type="submit" variant="outline" size="sm">
              Mark all read
            </Button>
          </form>
        }
      />
      <Card>
        <CardContent className="flex flex-col gap-1">
          {items.length === 0 && <p className="text-muted-foreground">Nothing here yet. Alerts, briefs and reports you receive also appear here.</p>}
          {items.map((item) => (
            <form key={item.id} action={openNotification}>
              <input type="hidden" name="id" value={item.id} />
              <button type="submit" className="flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left hover:bg-muted-surface">
                <span className="flex items-center gap-2">
                  <span className={item.readAt ? 'font-medium' : 'font-bold'}>{item.title}</span>
                  <span className="ml-auto flex-shrink-0 text-xs text-muted-foreground">{formatWhen(item.createdAt)}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{item.body}</span>
                  <span className="ml-auto flex-shrink-0 rounded-md bg-muted-surface-2 px-2 py-0.5 text-xs">{NOTIFICATION_KIND_LABELS[item.kind] ?? item.kind}</span>
                </span>
              </button>
            </form>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
