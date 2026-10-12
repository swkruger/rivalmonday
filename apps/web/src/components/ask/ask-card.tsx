import type { AccessContext } from '@cs/core';
import { hasFeature } from '@cs/core';
import Link from 'next/link';
import { assistantNameFor } from '@/server/ask';
import { dbs } from '@/server/db';
import { callTool } from '@/server/tools';
import { StarterChips } from './starter-chips';

/**
 * The Overview / basic-home "Ask {name}" card (Task 10): the client's starter questions as links to
 * `/c/<id>/ask?q=<question>`. Null without the `ask` feature and for guests (Q2). Shows no usage or quota (e4).
 */
export async function AskCard({ clientId, ctx }: { clientId: string; ctx: AccessContext }) {
  if (ctx.userId.startsWith('contact:') || !hasFeature(ctx, 'ask')) return null;
  const [starters, assistantName] = await Promise.all([
    callTool<{ questions: string[] }>(ctx, 'get_ask_starters', { clientId }),
    assistantNameFor(dbs().service, ctx.agencyId),
  ]);
  return (
    <section aria-label={`Ask ${assistantName}`} className="min-w-0 rounded-[14px] bg-surface p-6 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{`Ask ${assistantName}`}</h2>
        <Link href={`/c/${clientId}/ask`} className="font-semibold text-primary-soft-text">
          Open →
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Questions about your competitors, answered from the monitored evidence.</p>
      <div className="mt-3">
        <StarterChips questions={starters.questions} hrefFor={(q) => `/c/${clientId}/ask?q=${encodeURIComponent(q)}`} />
      </div>
    </section>
  );
}
