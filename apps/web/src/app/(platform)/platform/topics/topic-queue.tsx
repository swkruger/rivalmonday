'use client';
import type { TopicProposalView } from '@cs/tools';
import { Button, Band, Card, CardContent, CardHeader, CardTitle, ConfirmDialog, Section, StatusChip, Table, TableFrame, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import { useActionState } from 'react';
import type { FormResult } from '@/server/forms';
import { ErrorNote } from '@/components/form-error';
import { HelpEmpty } from '@/components/help/empty-state';
import { WriteGuard } from '@/components/read-only';
import { formatDate, formatRelative } from '@/lib/format';
import { TOPIC_PROPOSAL_STATUS, labelFor } from '@/lib/labels';

type Action = (prev: FormResult, fd: FormData) => Promise<FormResult>;

function Status({ status }: { status: string }) {
  const s = labelFor(TOPIC_PROPOSAL_STATUS, status);
  return <StatusChip tone={s.tone}>{s.label}</StatusChip>;
}

/**
 * One action state for every proposal's approve/reject, held here (not per item) so the result survives the decided
 * proposal leaving the pending list on revalidate (precedent `AlertList`, `CatalogQueue`). Each button opens a
 * `ConfirmDialog` that posts its own `decision`, so the decision never depends on which button submitted.
 */
export function TopicQueue({ pending, decided, action, tz, nowMs }: { pending: TopicProposalView[]; decided: TopicProposalView[]; action: Action; tz: string; nowMs?: number }) {
  // The server's clock (as `AlertList`), so the server render and hydration agree on "2 days ago" and on the year.
  const now = new Date(nowMs ?? Date.now());
  const [result, formAction, busy] = useActionState(action, { ok: true } as FormResult);
  return (
    <div className="flex flex-col gap-5">
      {!result.ok && <ErrorNote focusKey={result}>{result.error}</ErrorNote>}
      {result.ok && result.message && <p role="status" className="rounded-md bg-muted-surface p-3 text-ink">{result.message}</p>}
      {pending.length === 0 && <HelpEmpty id="platform.topics.queue" guideAnchor="what-this-page-tells-you" />}
      {pending.map((p) => (
        <Card key={p.id}>
          <CardHeader>
            <CardTitle className="text-lg">{p.name} <span className="font-mono text-xs font-normal text-muted-ink">{p.topicId}</span></CardTitle>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-ink">
              <Status status={p.status} />
              <span>{p.verticalName} · {p.otherCount} reviews with no topic · Proposed {formatRelative(p.createdAt, now, { tz })}</span>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p>{p.description}</p>
            {p.samples.length > 0 && (
              <ul className="flex flex-col gap-1 text-sm">
                {p.samples.map((s, i) => (
                  <li key={i}><Band tone="muted" className="p-2">
                    “<span>{s}</span>”</Band>
                  </li>
                ))}
              </ul>
            )}
            <WriteGuard>
              <div className="flex gap-2">
                <ConfirmDialog
                  trigger={<Button type="button" aria-label={`Approve ${p.name}`} disabled={busy}>Approve</Button>}
                  title={`Approve ${p.name}?`}
                  body="It becomes a topic that reviews are sorted into, and the last 180 days of reviews with no topic are checked against it."
                  confirmLabel="Approve"
                  fields={{ proposalId: p.id, name: p.name, decision: 'approved' }}
                  action={(fd) => formAction(fd)}
                />
                <ConfirmDialog
                  trigger={<Button type="button" variant="outline" aria-label={`Reject ${p.name}`} disabled={busy}>Reject</Button>}
                  title={`Reject ${p.name}?`}
                  body="It is not added to the topic list. This cannot be undone."
                  confirmLabel="Reject"
                  tone="danger"
                  fields={{ proposalId: p.id, name: p.name, decision: 'rejected' }}
                  action={(fd) => formAction(fd)}
                />
              </div>
            </WriteGuard>
          </CardContent>
        </Card>
      ))}
      {decided.length > 0 && (
        <Section title="Recently decided">
          <TableFrame>
            <Table>
              <TableHeader><TableRow><TableHead>Topic</TableHead><TableHead>Business type</TableHead><TableHead>Decision</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
              <TableBody>
                {decided.map((d) => (
                  <TableRow key={d.id}><TableCell>{d.name}</TableCell><TableCell>{d.verticalName}</TableCell><TableCell><Status status={d.status} /></TableCell><TableCell>{d.decidedAt ? formatDate(d.decidedAt, { tz, now }) : '—'}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        </Section>
      )}
    </div>
  );
}
