import { hasFeature } from '@cs/core';
import { Badge, Card, CardContent } from '@cs/ui';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';

export const dynamic = 'force-dynamic';

export default async function AiConnectionsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { ctx } = await requireContext();
  if (!hasFeature(ctx, 'mcp')) notFound();
  const profile = await callTool<{ name: string }>(ctx, 'get_client_profile', { clientId });
  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">AI connections</h1>
      <Card>
        <CardContent className="flex flex-col items-start gap-3">
          <p>
            Soon you&apos;ll be able to connect Claude or ChatGPT to {profile.name}&apos;s competitor data — ask about any change and get answers with the same evidence links. Personal access tokens and connector instructions will appear here.
          </p>
          <Badge variant="secondary">Coming in the next release</Badge>
        </CardContent>
      </Card>
    </>
  );
}
