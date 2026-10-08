'use client';
import type { ThemeProposalView } from '@cs/tools';
import { Badge, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import { useActionState } from 'react';
import type { FormResult } from '@/server/forms';

type Action = (prev: FormResult, fd: FormData) => Promise<FormResult>;

/**
 * One action state for every proposal's approve/reject, held here (not per item) so the result survives the
 * decided proposal leaving the pending list on revalidate (HANDOVER §6; precedent `AlertList`). Approve and reject
 * are separate forms, each with its own hidden `decision` input (not two submit buttons sharing one form), the
 * same shape as `AlertList`'s separate Approve/Dismiss forms — the decision never depends on which button a
 * `FormData(form, submitter)` resolves to.
 */
export function ThemeQueue({ pending, decided, action }: { pending: ThemeProposalView[]; decided: ThemeProposalView[]; action: Action }) {
  const [result, formAction, busy] = useActionState(action, { ok: true } as FormResult);
  return (
    <div className="flex flex-col gap-5">
      {!result.ok && <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">{result.error}</p>}
      {result.ok && result.message && <p className="rounded-lg bg-muted-surface p-3 text-ink">{result.message}</p>}
      {pending.length === 0 && <p className="text-muted-foreground">No proposals waiting.</p>}
      {pending.map((p) => (
        <div key={p.id} className="flex flex-col gap-3 rounded-[14px] bg-surface p-6 shadow-card">
          <div className="text-sm text-muted-ink">{p.verticalName} · {p.otherCount} unthemed reviews</div>
          <h3 className="text-lg font-bold">{p.name} <span className="font-mono text-xs text-muted-ink">{p.themeId}</span></h3>
          <p>{p.description}</p>
          {p.samples.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm">
              {p.samples.map((s, i) => (
                <li key={i} className="rounded-lg bg-muted-surface p-2">
                  “<span>{s}</span>”
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <form action={formAction}>
              <input type="hidden" name="proposalId" value={p.id} />
              <input type="hidden" name="name" value={p.name} />
              <input type="hidden" name="decision" value="approved" />
              <Button type="submit" aria-label={`Approve ${p.name}`} disabled={busy}>Approve</Button>
            </form>
            <form action={formAction}>
              <input type="hidden" name="proposalId" value={p.id} />
              <input type="hidden" name="name" value={p.name} />
              <input type="hidden" name="decision" value="rejected" />
              <Button type="submit" variant="outline" aria-label={`Reject ${p.name}`} disabled={busy}>Reject</Button>
            </form>
          </div>
        </div>
      ))}
      {decided.length > 0 && (
        <section className="rounded-[14px] bg-surface p-6 shadow-card">
          <h2 className="mb-3 font-bold">Recently decided</h2>
          <Table>
            <TableHeader><TableRow><TableHead>Topic</TableHead><TableHead>Business type</TableHead><TableHead>Decision</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
            <TableBody>
              {decided.map((d) => (
                <TableRow key={d.id}><TableCell>{d.name}</TableCell><TableCell>{d.verticalName}</TableCell><TableCell><Badge variant={d.status === 'approved' ? 'default' : 'outline'}>{d.status}</Badge></TableCell><TableCell>{d.decidedAt?.slice(0, 10) ?? '—'}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  );
}
