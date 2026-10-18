import { grantableScopes, isAgencyRole } from '@cs/core';
import type { ApiTokenView, OAuthGrantView } from '@cs/tools';
import { notFound } from 'next/navigation';
import { AccessTokensCard, ConnectedAppsCard, ConnectorUrlCard } from '@/components/ai-connections';
import { PageHeader } from '@/components/page-header';
import { requireContext } from '@/server/current-viewer';
import { webEnv } from '@/server/env';
import { callTool } from '@/server/tools';
import { createAgencyTokenAction, revokeAgencyGrantAction, revokeAgencyTokenAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'AI connections' };

/** Phase 6a: agency-wide AI connections (P10). Agency roles only; admins see every member's tokens and apps. */
export default async function AgencyAiConnectionsPage() {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const [tokens, grants] = await Promise.all([
    callTool<{ items: ApiTokenView[] }>(ctx, 'list_api_tokens', {}),
    callTool<{ items: OAuthGrantView[] }>(ctx, 'list_oauth_grants', {}),
  ]);
  const admin = ctx.role === 'agency_admin';

  return (
    <>
      <PageHeader
        title="AI connections"
        breadcrumb={[{ label: 'Agency settings', href: '/agency/settings' }, { label: 'AI connections' }]}
        description="Connect Claude, ChatGPT or another AI assistant to every client you can access. When it matters, it asks which client you mean."
      />
      {admin && <p className="text-muted-foreground">As an admin you see everyone&apos;s tokens and connected apps in this agency.</p>}
      <ConnectorUrlCard url={`${webEnv().appUrl}/mcp`} />
      <AccessTokensCard
        canCreate
        scopes={grantableScopes(ctx.role)}
        tokens={tokens.items}
        showOwner={admin}
        createAction={createAgencyTokenAction}
        revokeAction={revokeAgencyTokenAction}
      />
      <ConnectedAppsCard grants={grants.items} showOwner={admin} revokeAction={revokeAgencyGrantAction} />
    </>
  );
}
