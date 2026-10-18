import type { Metadata } from 'next';
import { cache } from 'react';
import { KbArticleView, type KbArticle } from '@/components/kb/article-view';
import { PageHeader } from '@/components/page-header';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';

export const dynamic = 'force-dynamic';

/** One read per request, shared by the tab title and the page. */
const loadArticle = cache(async (id: string) => {
  const { ctx } = await requireContext();
  return callTool<KbArticle>(ctx, 'get_kb_article', { kbId: id });
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  return { title: (await loadArticle((await params).id)).title };
}

/** A knowledge article as a page. Any refusal (hidden, unknown, foreign, malformed id) is a 404. */
export default async function KbArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const article = await loadArticle((await params).id);
  return (
    <>
      {/* No Help index until 15b: the article is its own (only) crumb. */}
      <PageHeader title={article.title} breadcrumb={[{ label: article.title }]} />
      <KbArticleView article={article} />
    </>
  );
}
