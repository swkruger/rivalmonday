import { Section, TableFrame } from '@cs/ui';
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
      <Section title="Notifications" titleAside={<HelpTip tip="agency.settings.platform-access.notify" />}>
        <NotifySwitch enabled={notifyEnabled} />
      </Section>
      <Section
        ruled
        title="Support sessions"
        titleAside={
          <>
            <HelpTip tip="agency.settings.platform-access.sessions" />
            <HelpTip tip="agency.settings.platform-access.endReasons" />
          </>
        }
      >
        {rows.length === 0 ? (
          <EmptyState {...COPY.empty.noSessions} guideAnchor="what-this-page-tells-you" />
        ) : (
          <TableFrame>
            <SupportSessionsTable rows={rows} empty="" tz={tz} />
          </TableFrame>
        )}
        {nextCursor && (
          <Link href={`/agency/settings/platform-access?cursor=${encodeURIComponent(nextCursor)}`} className="inline-block text-sm font-semibold text-primary-soft-text underline">
            Older sessions
          </Link>
        )}
      </Section>
    </>
  );
}
