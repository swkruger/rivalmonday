import { isAgencyRole } from '@cs/core';
import type { PlaybookVertical } from '@cs/tools';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { playbookAction } from './actions';
import { PlaybookEditor } from './playbook-editor';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Playbooks' };

export default async function PlaybooksPage() {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const { verticals } = await callTool<{ verticals: PlaybookVertical[] }>(ctx, 'list_playbooks', {});
  const canEdit = ctx.role === 'agency_admin';
  return (
    <>
      <PageHeader
        title="Playbooks"
        breadcrumb={[{ label: 'Agency settings', href: '/agency/settings' }, { label: 'Playbooks' }]}
        description="How Friday words its recommendations for each kind of competitor move. Your edits apply to every client of this agency."
      />
      {verticals.map((v) => (
        <section key={v.id} className="flex flex-col gap-4">
          <h2 className="text-lg font-bold">{v.name}</h2>
          <div className="grid gap-5 xl:grid-cols-2">
            {v.playbooks.map((p) => <PlaybookEditor key={`${v.id}:${p.id}`} verticalId={v.id} playbook={p} canEdit={canEdit} action={playbookAction} />)}
          </div>
        </section>
      ))}
    </>
  );
}
