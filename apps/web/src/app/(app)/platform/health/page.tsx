import { isPlatformOperator } from '@cs/tools';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { platformAdmins } from '@/server/runtime-env';

export const dynamic = 'force-dynamic';

/** Placeholder (spec d6). Gated by the operator check directly (no tool call, so no audit row); others get the 404. */
export default async function PlatformHealthPage() {
  const { ctx } = await requireContext();
  if (!(await isPlatformOperator({ service: dbs().service, platformAdmins: platformAdmins() }, ctx))) notFound();
  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">Platform health</h1>
      <p className="text-muted-foreground">Platform health arrives with the deployment phase.</p>
    </>
  );
}
