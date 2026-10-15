import { brief, client, type Db } from '@cs/db';
import { eq } from 'drizzle-orm';
import { type DeliveryConfig, loadBranding, notify } from '../delivery/outbox';
import { BRIEF_MAX_ATTEMPTS, type BriefRunResult } from './generate';

/** Decided copy (12b): the AM notice for a ready starting point. */
export const startingPointNotice = (clientName: string) => `Your starting point brief for ${clientName} is ready to review.`;

/** Decision 12 / spec §11: tell agency staff a brief is ready, or that it failed on its last attempt (never sent unverified). */
export async function notifyBriefOutcome(deps: { db: Db; delivery: DeliveryConfig }, result: BriefRunResult, now: Date): Promise<number> {
  if (result.status === 'skipped') return 0;
  const [row] = await deps.db.select({ b: brief, clientName: client.name, autoSend: client.briefAutoSend }).from(brief).innerJoin(client, eq(client.id, brief.clientId)).where(eq(brief.id, result.briefId));
  if (!row) return 0;
  const { b } = row;
  if (result.status === 'failed' && b.attempts < BRIEF_MAX_ATTEMPTS) return 0;
  const branding = await loadBranding(deps.db, b.agencyId);
  const ready = result.status === 'ready';
  const start = b.kind === 'starting_point';
  const title = ready ? (start ? startingPointNotice(row.clientName) : `Brief ready for review: ${row.clientName}`) : `Brief failed: ${row.clientName}`;
  const drops = b.dropped.items + b.dropped.sentences > 0 ? [`The verifier dropped ${b.dropped.items} item(s) and ${b.dropped.sentences} sentence(s).`] : [];
  const lines = ready && start
    ? [title, 'It goes to the client as soon as you approve it.', ...drops]
    : ready
    ? [
        b.kind === 'quiet' ? 'A quiet week: no item passed the bar.' : `${result.items} item${result.items === 1 ? '' : 's'} for delivery on ${b.deliveryDate}.`,
        b.summary,
        row.autoSend ? 'Auto-send is on: it goes out Monday 07:00 client time unless you edit, drop or reorder an item.' : 'Approve it before Monday 07:00 client time.',
        ...drops,
      ]
    : [
        `We could not produce a verified brief after ${b.attempts} attempts, so nothing will be sent for ${b.deliveryDate}.`,
        `Last error: ${(b.error ?? 'unknown').slice(0, 300)}`,
        'Fix the cause and run brief-once --force, or skip this week.',
      ];
  return notify(deps.db, deps.delivery, {
    agencyId: b.agencyId, clientId: b.clientId, kind: ready ? 'brief_ready' : 'brief_failed', audience: 'agency', subjectType: 'brief', subjectId: b.id,
    dedupe: `${ready ? 'brief_ready' : 'brief_failed'}:${b.id}`, link: { t: 'brief', id: b.id }, now,
    build: (r, link) => ({ title, body: lines.join('\n'), email: { template: 'agency_notice', props: { branding, recipientName: r?.name ?? null, clientName: row.clientName, notice: ready ? 'brief_ready' : 'brief_failed', title, lines, link, actionLabel: ready ? 'Review brief' : 'Open brief' } } }),
  });
}
