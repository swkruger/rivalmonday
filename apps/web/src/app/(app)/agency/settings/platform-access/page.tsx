import { Card, CardContent, CardHeader, CardTitle } from '@cs/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { type SupportSessionRow, SupportSessionsTable } from '@/components/support-sessions-table';
import { PageHeader } from '@/components/page-header';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { NotifySwitch } from './notify-switch';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Platform access' };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Phase 8b spec § UI: the agency's record of Rival Monday support sessions, plus the opt-in email. Agency admins only;
 * every other role, and a platform operator inside a support session (the tool is hidden there too), gets a 404.
 */
export default async function PlatformAccessPage({ searchParams }: { searchParams: Promise<{ cursor?: string | string[] }> }) {
  const { viewer, ctx } = await requireContext();
  if (viewer.kind !== 'user' || ctx.role !== 'agency_admin') notFound();
  const cursor = one((await searchParams).cursor)?.slice(0, 200);
  const { rows, nextCursor, notifyEnabled } = await callTool<{ rows: SupportSessionRow[]; nextCursor: string | null; notifyEnabled: boolean }>(
    ctx,
    'list_support_sessions',
    cursor ? { cursor } : {},
  );
  return (
    <>
      <PageHeader
        title="Platform access"
        breadcrumb={[{ label: 'Agency settings', href: '/agency/settings' }, { label: 'Platform access' }]}
        description="Every time Rival Monday support opened a read-only session on your agency, and why."
      />
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <NotifySwitch enabled={notifyEnabled} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Support sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <SupportSessionsTable rows={rows} empty="Rival Monday support has not opened a session on your agency." />
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
