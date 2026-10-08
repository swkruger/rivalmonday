import { hasFeature } from '@cs/core';
import type { EvidenceView } from '@cs/tools';
import { Card, CardContent, CardHeader, CardTitle } from '@cs/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';

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

/**
 * Decision 7: `get_evidence` needs only `read` — no `dashboard` flag — so briefs-only clients' chips keep working.
 * The "part of these changes" list is shown only to `dashboard` users (decision 3's live-event rule already applied
 * by the tool). The Changes feed link (Task 8) doesn't exist yet on this branch, so it 404s for two tasks mid-branch —
 * accepted, as in 5b-1 Task 9.
 */
export default async function EvidencePage({ params }: { params: Promise<{ clientId: string; evidenceId: string }> }) {
  const { clientId, evidenceId } = await params;
  const { ctx } = await requireContext();
  const evidence = await callTool<EvidenceView>(ctx, 'get_evidence', { clientId, evidenceId });
  const captured = formatUtc(evidence.capturedAt);
  const fileHref = `/files/evidence/${clientId}/${evidenceId}`;

  return (
    <>
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight">Evidence — {evidence.competitorName}</h1>
        <p className="mt-1 text-muted-foreground">
          {evidence.channelLabel} · captured {captured} · status {evidence.captureStatus}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
        </CardHeader>
        <CardContent>
          {evidence.kind === 'screenshot' ? (
            <div className="max-h-[720px] overflow-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fileHref}
                alt={`Snapshot of ${evidence.url ?? evidence.competitorName} captured ${captured}`}
                className="w-full rounded-lg border border-line"
              />
            </div>
          ) : evidence.kind === 'text' ? (
            <a href={fileHref} className="font-semibold text-primary-soft-text">
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
