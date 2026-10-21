import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { requireOperatorContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';
import { deleteKbArticleAction, saveKbArticleAction, setKbAutoSyncAction } from '../actions';
import { KbEditor } from '../editor';
import type { KbTargets } from '../scope-fields';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'New article' };

const HELP_KEY = 'page:platform.knowledge.new';
const COPY = PAGE_COPY['platform.knowledge.new'];

export default async function NewKnowledgePage() {
  const { ctx } = await requireOperatorContext();
  const [targets, guides] = await Promise.all([callTool<KbTargets>(ctx, 'list_kb_targets', {}), helpGuides(ctx, 'platform')]);
  return (
    <>
      <PageHeader
        title="New article"
        breadcrumb={[{ label: 'Platform', href: '/platform' }, { label: 'Knowledge', href: '/platform/knowledge' }, { label: 'New article' }]}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <TipRow
        items={[
          { label: 'Writing tips', tip: 'platform.knowledge.new.editor' },
          { label: 'Visibility', tip: 'platform.knowledge.new.visibility' },
        ]}
      />
      <KbEditor targets={targets} actions={{ save: saveKbArticleAction, remove: deleteKbArticleAction, autoSync: setKbAutoSyncAction }} />
    </>
  );
}
