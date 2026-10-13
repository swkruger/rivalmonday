import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { deleteKbArticleAction, saveKbArticleAction, setKbAutoSyncAction } from '../actions';
import { KbEditor } from '../editor';
import type { KbTargets } from '../scope-fields';

export const dynamic = 'force-dynamic';

export default async function NewKnowledgePage() {
  const { ctx } = await requireContext();
  const targets = await callTool<KbTargets>(ctx, 'list_kb_targets', {});
  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">New article</h1>
      <KbEditor targets={targets} actions={{ save: saveKbArticleAction, remove: deleteKbArticleAction, autoSync: setKbAutoSyncAction }} />
    </>
  );
}
