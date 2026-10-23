import type { TopicProposalView } from '@cs/tools';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { requireOperatorContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';
import { decideTopicAction } from './actions';
import { TopicQueue } from './topic-queue';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Topic proposals' };

const HELP_KEY = 'page:platform.topics';
const COPY = PAGE_COPY['platform.topics'];

/** Non-operators get the tool's permission_denied → 404 (decision 2). */
export default async function TopicProposalsPage() {
  const { ctx } = await requireOperatorContext();
  const [{ pending, decided }, guides] = await Promise.all([
    callTool<{ pending: TopicProposalView[]; decided: TopicProposalView[] }>(ctx, 'list_topic_proposals', {}),
    helpGuides(ctx, 'platform'),
  ]);
  return (
    <>
      <PageHeader
        title="Topic proposals"
        breadcrumb={[{ label: 'Platform', href: '/platform' }, { label: 'Topic proposals' }]}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <TipRow
        items={[
          { label: 'Where proposals come from', tip: 'platform.topics.source' },
          { label: 'Approve or reject', tip: 'platform.topics.decide' },
          { label: 'Recent decisions', tip: 'platform.topics.decided' },
        ]}
      />
      <TopicQueue pending={pending} decided={decided} action={decideTopicAction} />
    </>
  );
}
