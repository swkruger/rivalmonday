import { Card, CardContent, CardHeader, CardTitle } from '@cs/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { type SupportSessionRow, SupportSessionsTable } from '@/components/support-sessions-table';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { viewerTimeZone } from '@/server/viewer-tz';
import { callTool } from '@/server/tools';
import { NotifySwitch } from './notify-switch';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Platform access' };

const HELP_KEY = 'page:agency.settings.platform-access';
const COPY = PAGE_COPY['agency.settings.platform-access'];

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Phase 8b spec § UI: the agency's record of platform support sessions, plus the opt-in email. Agency admins only;
 * every other role, and a platform operator inside a support session (the tool is hidden there too), gets a 404.
 */
export default async function PlatformAccessPage({ searchParams }: { searchParams: Promise<{ cursor?: string | string[] }> }) {
  const { viewer, ctx } = await requireContext();
  if (viewer.kind !== 'user' || ctx.role !== 'agency_admin') notFound();
  const cursor = one((await searchParams).cursor)?.slice(0, 200);
  const [{ rows, nextCursor, notifyEnabled }, guides, tz] = await Promise.all([
    callTool<{ rows: SupportSessionRow[]; nextCursor: string | null; notifyEnabled: boolean }>(ctx, 'list_support_sessions', cursor ? { cursor } : {}),
    helpGuides(ctx, 'agency'),
    viewerTimeZone(),
  ]);
  return (
    <>
      <PageHeader
        title="Platform access"
        breadcrumb={[{ label: 'Agency settings', href: '/agency/settings' }, { label: 'Platform access' }]}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <Card>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-1.5">
            Notifications
            <HelpTip tip="agency.settings.platform-access.notify" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <NotifySwitch enabled={notifyEnabled} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-1.5">
            Support sessions
            <HelpTip tip="agency.settings.platform-access.sessions" />
            <HelpTip tip="agency.settings.platform-access.endReasons" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? <EmptyState {...COPY.empty.noSessions} guideAnchor="what-this-page-tells-you" /> : <SupportSessionsTable rows={rows} empty="" tz={tz} />}
          {nextCursor && (
            <Link href={`/agency/settings/platform-access?cursor=${encodeURIComponent(nextCursor)}`} className="mt-3 inline-block text-sm font-semibold text-primary-soft-text underline">
              Older sessions
            </Link>
          )}
        </CardContent>
      </Card>
    </>
  );
}
