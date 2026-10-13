import { saveArticle } from '@cs/tools';
import type { SeedContext } from './context';

/** Phase 6c: one published platform article so the knowledge screens (operator list/editor, viewer) have data. */
export async function seedKb(ctx: SeedContext): Promise<void> {
  const r = await saveArticle(
    ctx.db,
    ctx.ids.users.operator.userId,
    {
      level: 'platform',
      kind: 'help',
      title: 'Reading a demo article',
      bodyMd: '# Reading a demo article\n\nThis article ships with the demo data so the knowledge screens have something to show.\n\n## Where it appears\n\nOperators manage it under Platform, Knowledge. Everyone can open it from a link in the Ask assistant.',
      status: 'published',
    },
    { source: 'manual' },
  );
  ctx.ids.kbArticleId = r.id;
}
