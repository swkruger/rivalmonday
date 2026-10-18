import type { Metadata } from 'next';
import { cache } from 'react';
import { PageHeader } from '@/components/page-header';
import { requireOperatorContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { deleteKbArticleAction, saveKbArticleAction, setKbAutoSyncAction } from '../actions';
import { type EditorArticle, KbEditor } from '../editor';
import type { KbTargets } from '../scope-fields';

export const dynamic = 'force-dynamic';

/** One read per request, shared by the tab title and the page. */
const loadArticle = cache(async (id: string) => {
  const { ctx } = await requireOperatorContext();
  return callTool<EditorArticle>(ctx, 'get_kb_article_admin', { id });
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  return { title: (await loadArticle((await params).id)).title };
}

/** Any refusal (non-operator, unknown or malformed id) is a 404. `?lint=` carries the first save's lint warnings. */
export default async function EditKnowledgePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ lint?: string | string[] }> }) {
  const { ctx } = await requireOperatorContext();
  const { id } = await params;
  const { lint: rawLint } = await searchParams;
  // `?lint=` may repeat (an array) or be absent; take the first value and cap it so it can never throw or flood the page.
  const lint = (Array.isArray(rawLint) ? rawLint[0] : rawLint)?.slice(0, 500);
  const article = await loadArticle(id);
  const targets = await callTool<KbTargets>(ctx, 'list_kb_targets', {});
  return (
    <>
      <PageHeader title={article.title} breadcrumb={[{ label: 'Platform', href: '/platform' }, { label: 'Knowledge', href: '/platform/knowledge' }, { label: article.title }]} />
      <KbEditor article={article} targets={targets} actions={{ save: saveKbArticleAction, remove: deleteKbArticleAction, autoSync: setKbAutoSyncAction }} {...(lint ? { initialNotice: lint.split('|').join(' ') } : {})} />
    </>
  );
}
