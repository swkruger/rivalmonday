import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';

export const dynamic = 'force-dynamic';

/** Placeholder (spec d6). Calls a platform tool so non-operators get the 404 like every other /platform page. */
export default async function PlatformHealthPage() {
  const { ctx } = await requireContext();
  await callTool(ctx, 'list_platform_activity', { limit: 1 });
  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">Platform health</h1>
      <p className="text-muted-foreground">Platform health arrives with the deployment phase.</p>
    </>
  );
}
