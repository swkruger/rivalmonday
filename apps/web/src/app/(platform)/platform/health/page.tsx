import { isPlatformOperator } from '@cs/tools';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { requireOperatorContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { platformAdmins } from '@/server/runtime-env';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Health' };

/** Placeholder (spec d6). Gated by the operator check directly (no tool call, so no audit row); others get the 404. */
export default async function PlatformHealthPage() {
  const { ctx } = await requireOperatorContext();
  if (!(await isPlatformOperator({ service: dbs().service, platformAdmins: platformAdmins() }, ctx))) notFound();
  return (
    <>
      <PageHeader title="Health" breadcrumb={[{ label: 'Platform', href: '/platform' }, { label: 'Health' }]} description="Platform health arrives with the deployment phase." />
    </>
  );
}
