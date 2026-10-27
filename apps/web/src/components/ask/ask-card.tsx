import type { AccessContext } from '@cs/core';
import { hasChannel } from '@cs/core';
import { Band, Button, Input } from '@cs/ui';
import Link from 'next/link';
import { assistantNameFor } from '@/server/ask';
import { dbs } from '@/server/db';
import { callTool } from '@/server/tools';
import { StarterChips } from './starter-chips';

/** Same cap as the Ask page's box and its `?q=` handling. */
const QUESTION_MAX = 2000;

/**
 * The Overview / basic-home "Ask {name}" card (Task 10): a question box and the client's starter questions, both
 * opening `/c/<id>/ask?q=<question>`. Null without the `ask` feature, for guests (Q2) and inside support sessions. Shows no usage or quota (e4).
 */

export async function AskCard({ clientId, ctx }: { clientId: string; ctx: AccessContext }) {
  // Phase 8b: Ask tools are not offered in a support session (conversations are private), so the card is not rendered there.
  if (ctx.support || ctx.userId.startsWith('contact:') || !hasChannel(ctx, 'ask')) return null;
  const [starters, assistantName] = await Promise.all([
    callTool<{ questions: string[] }>(ctx, 'get_ask_starters', { clientId }),
    assistantNameFor(dbs().service, ctx.agencyId),
  ]);
  // 16b (D-26): the Friday band on the Overview; the labelled `<section>` keeps its region name.
  return (
    <section aria-label={`Ask ${assistantName}`} className="min-w-0">
      <Band tone="canvas">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-ink">{`Ask ${assistantName}`}</h2>
          <Link href={`/c/${clientId}/ask`} className="font-semibold text-primary-soft-text">
            Open →
          </Link>
        </div>
        <p className="mt-1 text-sm text-muted-ink">Questions about your competitors, answered from the monitored evidence.</p>
        {/* A plain GET form: the Ask page sends `?q=` once on arrival, like a starter chip. */}
        <form action={`/c/${clientId}/ask`} method="get" className="mt-3 flex items-center gap-2">
          <Input
            name="q"
            required
            maxLength={QUESTION_MAX}
            autoComplete="off"
            aria-label={`Ask ${assistantName} a question`}
            placeholder={`Ask ${assistantName} a question…`}
            className="flex-1"
          />
          <Button type="submit">Ask</Button>
        </form>
        <div className="mt-3">
          <StarterChips questions={starters.questions} hrefFor={(q) => `/c/${clientId}/ask?q=${encodeURIComponent(q)}`} />
        </div>
      </Band>
    </section>
  );
}
