import { isAgencyRole } from '@cs/core';
import type { ClientProfile, SuggestionView, TrackedCompetitor } from '@cs/tools';
import { COMPETITOR_LIMIT } from '@cs/tools';
import { Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { AddCompetitorForm, RemoveCompetitorButton, SuggestionsPanel } from './competitor-controls';

export const dynamic = 'force-dynamic';

export default async function CompetitorsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const [profile, tracked, suggestions] = await Promise.all([
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    callTool<{ items: TrackedCompetitor[] }>(ctx, 'list_client_competitors', { clientId }),
    callTool<{ items: SuggestionView[] }>(ctx, 'list_competitor_suggestions', { clientId }),
  ]);
  const atLimit = tracked.items.length >= COMPETITOR_LIMIT;
  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">Competitors — {profile.name}</h1>
      <p className="text-muted-foreground">
        Track 3–5 direct competitors ({tracked.items.length} of {COMPETITOR_LIMIT}).
      </p>
      <Card>
        <CardHeader>
          <CardTitle>Tracked competitors</CardTitle>
        </CardHeader>
        <CardContent>
          {tracked.items.length === 0 ? (
            <p className="text-muted-foreground">None yet — accept a suggestion or add one below.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Pages monitored</TableHead>
                  <TableHead>Since</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tracked.items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link href={`/c/${clientId}/competitors/${c.id}`} className="font-semibold text-primary-soft-text">
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell>{c.domain ?? '—'}</TableCell>
                    <TableCell>{c.activePages}</TableCell>
                    <TableCell>{c.addedAt.slice(0, 10)}</TableCell>
                    <TableCell>
                      <RemoveCompetitorButton clientId={clientId} competitorId={c.id} name={c.name} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="mt-5 border-t border-line pt-5">
            <AddCompetitorForm clientId={clientId} atLimit={atLimit} />
          </div>
        </CardContent>
      </Card>
      <SuggestionsPanel clientId={clientId} ready={profile.keywords.length > 0 && profile.serviceArea !== null} suggestions={suggestions.items} atLimit={atLimit} />
    </>
  );
}
