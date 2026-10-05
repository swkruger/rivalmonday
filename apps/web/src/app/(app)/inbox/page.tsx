import { listInbox } from '@cs/tools';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@cs/ui';
import { requireContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { inboxOwnerFor, NOTIFICATION_KIND_LABELS } from '@/server/inbox';
import { markAllReadAction, openNotification } from './actions';

export const dynamic = 'force-dynamic';

function formatWhen(d: Date): string {
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default async function InboxPage() {
  const { viewer } = await requireContext();
  const items = await listInbox(dbs().service, inboxOwnerFor(viewer), { limit: 100 });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3">
        <CardTitle>Inbox</CardTitle>
        <form action={markAllReadAction} className="ml-auto">
          <Button type="submit" variant="outline" size="sm">
            Mark all read
          </Button>
        </form>
      </CardHeader>
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
  );
}
