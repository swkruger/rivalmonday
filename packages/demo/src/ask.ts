import { askMessage, askStarter, askThread } from '@cs/db';
import type { SeedContext } from './context';

/** Exactly 4 × 10–90 characters (the starter limits). */
export const DEMO_ASK_STARTERS = [
  'What changed with competitor prices this month?',
  'Which competitor is the biggest threat right now?',
  'Are any rivals running new promotions?',
  'What are customers complaining about at rivals?',
] as const;

/**
 * Phase 6b "Ask": Lone Star (which has the `ask` feature, see tenancy) gets its weekly starters; the admin and the Lone Star owner each have
 * one thread whose answer cites a real Lone Star event's evidence (author-only RLS: each user sees only their own).
 * Lone Star allows review (the default), so both threads show on /platform/ask. No usage numbers anywhere (e4).
 */
export async function seedAsk(ctx: SeedContext): Promise<void> {
  const { db, ids, clock } = ctx;
  const clientId = ids.clients.loneStar;
  await db.insert(askStarter).values({ clientId, agencyId: ids.agencyId, questions: [...DEMO_ASK_STARTERS], generatedAt: clock.daysAgo(1) });

  const cited = ids.events.filter((e) => e.client === 'loneStar' && e.evidenceIds.length > 0);
  const threads = [
    { key: 'admin' as const, question: DEMO_ASK_STARTERS[0], event: cited[0]!, at: clock.daysAgo(2), counts: false },
    { key: 'ownerLoneStar' as const, question: DEMO_ASK_STARTERS[2], event: cited[1] ?? cited[0]!, at: clock.daysAgo(1), counts: true },
  ];
  for (const t of threads) {
    const userId = ids.users[t.key].userId;
    const evidenceId = t.event.evidenceIds[0]!;
    const [thread] = await db.insert(askThread).values({ agencyId: ids.agencyId, clientId, userId, title: t.question, createdAt: t.at, updatedAt: t.at }).returning({ id: askThread.id });
    const base = { threadId: thread!.id, agencyId: ids.agencyId, clientId, userId };
    const answerAt = new Date(t.at.getTime() + 8_000);
    await db.insert(askMessage).values([
      { ...base, role: 'user', content: t.question, countsTowardQuota: t.counts, createdAt: t.at },
      {
        ...base, role: 'assistant', createdAt: answerAt, citations: [`ev:${evidenceId}`],
        content: `${t.event.summary.replace(/[.!?]+$/, '')} [ev:${evidenceId}].\n\nPossible reason: a seasonal push before the summer rush.`,
        trace: {
          model: 'demo/scripted', guard: 'in_scope', removedSentences: 0, deadlineHit: false, costUsd: 0.0012,
          steps: [{ tool: 'search_events', args: { clientId, route: 'all', days: 30 }, rows: 1 }],
        },
      },
    ]);
    ids.ask[t.key] = thread!.id;
  }
}
