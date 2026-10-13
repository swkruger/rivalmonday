import { KbArticleView, type KbArticle } from '@/components/kb/article-view';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';

export const dynamic = 'force-dynamic';

/** A knowledge article as a page. Any refusal (hidden, unknown, foreign, malformed id) is a 404. */
export default async function KbArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireContext();
  const { id } = await params;
  const article = await callTool<KbArticle>(ctx, 'get_kb_article', { kbId: id });
  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">{article.title}</h1>
      <KbArticleView article={article} />
    </>
  );
}
