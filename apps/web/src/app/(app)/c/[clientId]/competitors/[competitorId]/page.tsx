import { isAgencyRole, PAGE_TYPES } from '@cs/core';
import type { TrackedCompetitor, TrackedPageView } from '@cs/tools';
import { Badge, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { webEnv } from '@/server/env';
import { callTool } from '@/server/tools';
import { AddPageForm, PinPageSwitch } from './page-controls';

export const dynamic = 'force-dynamic';

export default async function CompetitorPagesPage({ params }: { params: Promise<{ clientId: string; competitorId: string }> }) {
  const { clientId, competitorId } = await params;
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const [tracked, pages] = await Promise.all([
    callTool<{ items: TrackedCompetitor[] }>(ctx, 'list_client_competitors', { clientId }),
    callTool<{ items: TrackedPageView[] }>(ctx, 'list_tracked_pages', { clientId, competitorId }),
  ]);
  const competitor = tracked.items.find((c) => c.id === competitorId);
  if (!competitor) notFound();

  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">{competitor.name} — Tracked pages</h1>
      <Card>
        <CardHeader>
          <CardTitle>Pages</CardTitle>
        </CardHeader>
        <CardContent>
          {pages.items.length === 0 ? (
            <p className="text-muted-foreground">No pages tracked yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URL</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Cadence</TableHead>
                  <TableHead>Last captured</TableHead>
                  <TableHead>Pinned</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pages.items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.url}</TableCell>
                    <TableCell>{p.pageType}</TableCell>
                    <TableCell>{p.cadence}</TableCell>
                    <TableCell>{p.lastCapturedAt ? p.lastCapturedAt.slice(0, 10) : '—'}</TableCell>
                    <TableCell>
                      <PinPageSwitch clientId={clientId} competitorId={competitorId} page={p} />
                    </TableCell>
                    <TableCell>{!p.active && <Badge variant="secondary">Inactive</Badge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="mt-5 border-t border-line pt-5">
            {webEnv().webMonitoring ? (
              <AddPageForm clientId={clientId} competitorId={competitorId} pageTypes={[...PAGE_TYPES]} />
            ) : (
              <p className="text-muted-foreground">Website monitoring is switched off for now, so pages can’t be added.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
