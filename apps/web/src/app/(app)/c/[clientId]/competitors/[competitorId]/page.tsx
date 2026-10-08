import { hasFeature, isAgencyRole, PAGE_TYPES } from '@cs/core';
import type { CompetitorProfile, TimelineItem, TrackedPageView } from '@cs/tools';
import { Badge, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PressureBadge } from '@/components/pressure-badge';
import { requireContext } from '@/server/current-viewer';
import { webEnv } from '@/server/env';
import { relativeTime } from '@/server/format';
import { callTool } from '@/server/tools';
import { AddPageForm, PinPageSwitch } from './page-controls';
import { Timeline } from './timeline';

export const dynamic = 'force-dynamic';

const PERIODS = [30, 90, 365] as const;

const fmtDate = (iso: string, withYear = false) =>
  new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });

function Kpi({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 pt-5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        {children}
      </CardContent>
    </Card>
  );
}

export default async function CompetitorProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string; competitorId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { clientId, competitorId } = await params;
  const sp = await searchParams;
  const { ctx } = await requireContext();
  if (!hasFeature(ctx, 'dashboard')) notFound();
  const raw = Number(Array.isArray(sp.days) ? sp.days[0] : sp.days);
  const days = (PERIODS as readonly number[]).includes(raw) ? raw : 90;
  const [profile, timeline, pages] = await Promise.all([
    callTool<CompetitorProfile>(ctx, 'get_competitor_profile', { clientId, competitorId }),
    callTool<{ items: TimelineItem[] }>(ctx, 'get_competitor_timeline', { clientId, competitorId, days }),
    callTool<{ items: TrackedPageView[] }>(ctx, 'list_tracked_pages', { clientId, competitorId }),
  ]);
  const now = new Date();
  const agency = isAgencyRole(ctx.role);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[26px] font-extrabold tracking-tight">{profile.name}</h1>
        {profile.domain && (
          <a href={`https://${profile.domain}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-soft-text">
            {profile.domain}
          </a>
        )}
        <PressureBadge score={profile.pressure.score} level={profile.pressure.level} />
        <span className="text-sm text-muted-foreground">Tracked since {fmtDate(profile.addedAt, true)}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Google rating">
          {profile.gbp ? (
            <>
              <span className="text-xl font-extrabold">{profile.gbp.rating ?? '—'} ★</span>
              <span className="text-sm text-muted-foreground">{profile.gbp.reviews ?? 0} reviews</span>
              {profile.gbpAsOf && <span className="text-xs text-muted-foreground">as of {fmtDate(profile.gbpAsOf)}</span>}
            </>
          ) : (
            <span className="text-sm text-muted-foreground">No Google profile yet</span>
          )}
        </Kpi>
        <Kpi label="Active ads">
          <span className="text-xl font-extrabold">
            Google {profile.activeAds.google} · Meta {profile.activeAds.meta}
          </span>
        </Kpi>
        <Kpi label="Open moves">
          <Link href={`/c/${clientId}/moves`} className="text-xl font-extrabold text-primary-soft-text">
            {profile.openMoves}
          </Link>
        </Kpi>
        <Kpi label="Pages monitored">
          <span className="text-xl font-extrabold">{profile.pages.active}</span>
          {profile.pages.blocked > 0 && (
            <span className="w-fit rounded-md bg-[#FEE2E2] px-2 py-0.5 text-xs font-semibold text-[#B91C1C]">Site blocks monitoring</span>
          )}
        </Kpi>
      </div>

      {/* 5c-2 adds Pricing, Ads, Reviews and Rankings sections here. */}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
            <nav aria-label="Period" className="flex gap-3 text-sm">
              {PERIODS.map((p) => (
                <Link
                  key={p}
                  href={`/c/${clientId}/competitors/${competitorId}?days=${p}`}
                  aria-current={p === days ? 'page' : undefined}
                  className={p === days ? 'font-semibold text-ink' : 'text-muted-foreground hover:text-ink'}
                >
                  {p} days
                </Link>
              ))}
            </nav>
          </CardHeader>
          <CardContent>
            <Timeline clientId={clientId} items={timeline.items} />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Collection status</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2 text-sm">
                {profile.sources.map((s) => (
                  <li key={s.source} className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-ink">{s.label}</span>
                    <span className="text-muted-foreground">
                      {s.lastRunAt ? `${relativeTime(s.lastRunAt, now)} · ${s.lastStatus ?? ''}` : 'Not run yet'}
                      {s.active ? '' : ' · paused'}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <PagesCard clientId={clientId} competitorId={competitorId} pages={pages.items} agency={agency} />
        </div>
      </div>
    </>
  );
}

function PagesCard({ clientId, competitorId, pages, agency }: { clientId: string; competitorId: string; pages: TrackedPageView[]; agency: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pages</CardTitle>
      </CardHeader>
      <CardContent>
        {pages.length === 0 ? (
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
              {pages.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.url}</TableCell>
                  <TableCell>{p.pageType}</TableCell>
                  <TableCell>{p.cadence}</TableCell>
                  <TableCell>{p.lastCapturedAt ? p.lastCapturedAt.slice(0, 10) : '—'}</TableCell>
                  <TableCell>{agency ? <PinPageSwitch clientId={clientId} competitorId={competitorId} page={p} /> : p.pinned ? 'Pinned' : '—'}</TableCell>
                  <TableCell>{!p.active && <Badge variant="secondary">Inactive</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {agency && (
          <div className="mt-5 border-t border-line pt-5">
            {webEnv().webMonitoring ? (
              <AddPageForm clientId={clientId} competitorId={competitorId} pageTypes={[...PAGE_TYPES]} />
            ) : (
              <p className="text-muted-foreground">Website monitoring is switched off for now, so pages can’t be added.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
