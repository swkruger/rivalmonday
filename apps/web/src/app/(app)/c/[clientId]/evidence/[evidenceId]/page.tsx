import { hasFeature, hasPermission } from '@cs/core';
import type { ClientProfile, EvidenceView } from '@cs/tools';
import { Card, CardContent, CardHeader, CardTitle } from '@cs/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { cache, type ReactNode } from 'react';
import { RATIONALE_MAX, SaveRecommendationDialog, TITLE_MAX } from '@/components/ask/save-recommendation-dialog';
import { EvidenceImage } from '@/components/evidence-image';
import { clientCrumbs } from '@/components/client-crumbs';
import { PageHeader } from '@/components/page-header';
import { assistantNameFor } from '@/server/ask';
import { requireContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { callTool } from '@/server/tools';
import { saveAskRecommendation } from '../../ask/actions';

export const dynamic = 'force-dynamic';

/** `get_evidence`'s `kind` values that are never served raw (decision 6) — their readable label for the placeholder message. */
const RAW_KIND_LABEL: Record<string, string> = { html: 'page HTML', vendor_json: 'vendor data' };

function formatUtc(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' });
}

function formatUtcDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="break-all">{value}</dd>
    </div>
  );
}

type Ctx = Awaited<ReturnType<typeof requireContext>>['ctx'];
/** One `get_evidence` per request (keyed by the request's cached ctx), shared by the tab title and the page. */
const loadEvidence = cache((ctx: Ctx, clientId: string, evidenceId: string) => callTool<EvidenceView>(ctx, 'get_evidence', { clientId, evidenceId }));

const titleOf = (evidence: EvidenceView) => `Evidence — ${evidence.competitorName}`;

export async function generateMetadata({ params }: { params: Promise<{ clientId: string; evidenceId: string }> }): Promise<Metadata> {
  const { clientId, evidenceId } = await params;
  const { ctx } = await requireContext();
  return { title: titleOf(await loadEvidence(ctx, clientId, evidenceId)) };
}

/**
 * Decision 7: `get_evidence` needs only `read` — no `dashboard` flag — so briefs-only clients' chips keep working.
 * The "part of these changes" list is shown only to `dashboard` users (decision 3's live-event rule already applied
 * by the tool). The Changes feed link (Task 8) doesn't exist yet on this branch, so it 404s for two tasks mid-branch —
 * accepted, as in 5b-1 Task 9.
 */
export default async function EvidencePage({ params }: { params: Promise<{ clientId: string; evidenceId: string }> }) {
  const { clientId, evidenceId } = await params;
  const { viewer, ctx } = await requireContext();
  const [evidence, profile] = await Promise.all([loadEvidence(ctx, clientId, evidenceId), callTool<ClientProfile>(ctx, 'get_client_profile', { clientId })]);
  const captured = formatUtc(evidence.capturedAt);
  // Ask entry points: signed-in users with the `ask` feature (never guests, Q2). "Add recommendation" mirrors
  // `add_recommendation` itself: `feedback` permission and the `dashboard` feature.
  const canAsk = viewer.kind === 'user' && !ctx.userId.startsWith('contact:') && hasFeature(ctx, 'ask');
  const canRecommend = canAsk && hasPermission(ctx, 'feedback') && hasFeature(ctx, 'dashboard');
  const assistantName = canAsk ? await assistantNameFor(dbs().service, ctx.agencyId) : null;
  const fileHref = `/files/evidence/${clientId}/${evidenceId}`;

  return (
    <>
      {/* 15a §2.7: back to the Changes feed — only for viewers who have it (briefs-only clients reach evidence from a brief). */}
      <PageHeader
        title={titleOf(evidence)}
        breadcrumb={clientCrumbs({ id: clientId, name: profile.name }, ...(hasFeature(ctx, 'dashboard') ? [{ label: 'Changes', href: `/c/${clientId}/changes` }] : []), 'Evidence')}
        description={`${evidence.channelLabel} · captured ${captured} · status ${evidence.captureStatus}`}
      />

      {assistantName && (
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/c/${clientId}/ask?seed=${evidenceId}`} className="inline-flex h-9 items-center rounded-md bg-amber px-4 text-sm font-semibold text-[#3B2300]">
            {`Ask ${assistantName} about this`}
          </Link>
          {canRecommend && (
            <SaveRecommendationDialog
              clientId={clientId}
              evidenceIds={[evidenceId]}
              defaultTitle={`Respond to ${evidence.competitorName}`.slice(0, TITLE_MAX)}
              defaultRationale={`Based on ${evidence.channelLabel} evidence for ${evidence.competitorName}, captured ${captured}.`.slice(0, RATIONALE_MAX)}
              saveAction={saveAskRecommendation}
              triggerLabel="Add recommendation"
            />
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
        </CardHeader>
        <CardContent>
          {evidence.kind === 'screenshot' ? (
            <div className="max-h-[720px] overflow-auto">
              <EvidenceImage
                src={fileHref}
                alt={`Snapshot of ${evidence.url ?? evidence.competitorName} captured ${captured}`}
                className="w-full rounded-lg border border-line"
              />
            </div>
          ) : evidence.kind === 'text' ? (
            <a href={fileHref} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-soft-text">
              Open the captured text
            </a>
          ) : (
            <p className="text-muted-foreground">
              This evidence is stored as raw {RAW_KIND_LABEL[evidence.kind] ?? evidence.kind} and kept unchanged; it isn’t displayed here. Its fingerprint is below.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Capture details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <DetailRow label="Source" value={evidence.channel === 'web' ? `${evidence.channelLabel} · rendered by RivalMondayBot` : evidence.channelLabel} />
            <DetailRow label="URL" value={evidence.url ?? '—'} />
            <DetailRow label="Captured" value={captured} />
            <DetailRow label="Status" value={evidence.captureStatus} />
            <DetailRow label="SHA-256" value={<span className="font-mono break-all">{evidence.sha256}</span>} />
            <DetailRow
              label="Kept"
              value={evidence.legalHold ? 'On legal hold — never deleted' : 'Kept under the retention policy, and for as long as a delivered brief cites it'}
            />
          </dl>
        </CardContent>
      </Card>

      {hasFeature(ctx, 'dashboard') && evidence.citedBy.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Part of these changes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {evidence.citedBy.map((c) => (
                <li key={c.eventId}>
                  <Link href={`/c/${clientId}/changes?event=${c.eventId}`} className="font-semibold text-primary-soft-text">
                    {c.typeLabel} · {c.summary} · {formatUtcDate(c.occurredAt)}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
