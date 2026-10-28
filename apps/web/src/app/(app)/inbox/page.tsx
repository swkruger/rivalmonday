import { listInbox } from '@cs/tools';
import { Button, Frame, StatusChip, Tag } from '@cs/ui';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { formatDateTime } from '@/lib/format';
import { PAGE_COPY } from '@/help/copy';
import { requireContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { helpGuides } from '@/server/help';
import { inboxOwnerFor, NOTIFICATION_KIND_LABELS } from '@/server/inbox';
import { viewerTimeZone } from '@/server/viewer-tz';
import { markAllReadAction, openNotification } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Inbox' };

const HELP_KEY = 'page:account.inbox';
const COPY = PAGE_COPY['account.inbox'];

export default async function InboxPage() {
  const { viewer, ctx } = await requireContext();
  // Phase 8b R9: the inbox is the operator's own (personal) notifications, not the agency's — hidden in a session.
  if (ctx.support) notFound();
  // /inbox is outside /agency, /c and /platform, so the guide drawer reads the agency scope (helpScopeOf); read the same one here.
  const [items, guides, tz] = await Promise.all([listInbox(dbs().service, inboxOwnerFor(viewer), { limit: 100 }), helpGuides(ctx, 'agency'), viewerTimeZone()]);
  // Signed-in people (agency staff and client users) can hold several clients; a guest link covers exactly one.
  const showClient = viewer.kind === 'user';
  return (
    <>
      <PageHeader
        title="Inbox"
        breadcrumb={[{ label: 'Inbox' }]}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
        actions={
          <form action={markAllReadAction}>
            <Button type="submit" variant="outline" size="sm">
              Mark all read
            </Button>
          </form>
        }
      />
      <TipRow
        items={[
          { label: 'Unread and read', tip: 'account.inbox.unread' },
          { label: 'Labels', tip: 'account.inbox.labelsAgency' },
          { label: 'Labels', tip: 'account.inbox.labelsClient' },
          { label: 'What arrives', tip: 'account.inbox.choose' },
        ]}
      />
      {items.length === 0 ? (
        <EmptyState {...COPY.empty.none} guideAnchor="how-to-use-it" />
      ) : (
        <Frame flush className="overflow-clip divide-y divide-line">
          {items.map((item) => {
            const when = formatDateTime(item.createdAt, { tz, zoneLabel: true });
            return (
            <form key={item.id} action={openNotification}>
              <input type="hidden" name="id" value={item.id} />
              <button
                type="submit"
                aria-label={`${item.title}${item.readAt ? '' : ' (new)'}, ${when}${showClient && item.clientName ? `, ${item.clientName}` : ''}. ${item.body}`}
                className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <span className="flex items-center gap-2">
                  <span className={item.readAt ? 'font-medium' : 'font-semibold'}>{item.title}</span>
                  {!item.readAt && <StatusChip tone="info">New</StatusChip>}
                  <span className="ml-auto flex-shrink-0 text-xs text-muted-ink">{when}</span>
                </span>
                {showClient && item.clientName && <span className="text-xs text-muted-ink">{item.clientName}</span>}
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-ink">{item.body}</span>
                  <Tag className="ml-auto shrink-0">{NOTIFICATION_KIND_LABELS[item.kind] ?? item.kind}</Tag>
                </span>
              </button>
            </form>
            );
          })}
        </Frame>
      )}
    </>
  );
}
