import { PageHeader } from '@/components/page-header';
import { requireOperatorContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { deleteKbArticleAction, saveKbArticleAction, setKbAutoSyncAction } from '../actions';
import { KbEditor } from '../editor';
import type { KbTargets } from '../scope-fields';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'New article' };

export default async function NewKnowledgePage() {
  const { ctx } = await requireOperatorContext();
  const targets = await callTool<KbTargets>(ctx, 'list_kb_targets', {});
  return (
    <>
      <PageHeader title="New article" breadcrumb={[{ label: 'Platform', href: '/platform' }, { label: 'Knowledge', href: '/platform/knowledge' }, { label: 'New article' }]} />
      <KbEditor targets={targets} actions={{ save: saveKbArticleAction, remove: deleteKbArticleAction, autoSync: setKbAutoSyncAction }} />
    </>
  );
}
