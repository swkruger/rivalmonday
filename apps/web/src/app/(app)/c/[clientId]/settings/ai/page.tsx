import { grantableScopes, hasFeature, isAgencyRole } from '@cs/core';
import type { ApiTokenView, ClientProfile, OAuthGrantView } from '@cs/tools';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AccessTokensCard, ConnectedAppsCard, ConnectorUrlCard } from '@/components/ai-connections';
import { requireContext } from '@/server/current-viewer';
import { webEnv } from '@/server/env';
import { callTool } from '@/server/tools';
import { createClientTokenAction, revokeClientGrantAction, revokeClientTokenAction } from './actions';

export const dynamic = 'force-dynamic';

/** Phase 6a: a client's AI connections. Client roles create client-bound tokens here (P10); agency roles only see this client's lists. */
export default async function AiConnectionsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { viewer, ctx } = await requireContext();
  // Page refusals are 404s, decided before any tool call: signed-link guests never manage tokens (P10), and client
  // roles need the client's `mcp` feature (agency roles bypass it in `hasFeature`).
  if (viewer.kind === 'guest' || !hasFeature(ctx, 'mcp')) notFound();
  const profile = await callTool<ClientProfile>(ctx, 'get_client_profile', { clientId });
  const [tokens, grants] = await Promise.all([
    callTool<{ items: ApiTokenView[] }>(ctx, 'list_api_tokens', { clientId }),
    callTool<{ items: OAuthGrantView[] }>(ctx, 'list_oauth_grants', { clientId }),
  ]);
  const agency = isAgencyRole(ctx.role);
  const admin = ctx.role === 'agency_admin';
  const hidden = { clientId };

  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">AI connections</h1>
      <p className="text-ink">
        Connect Claude, ChatGPT or another AI assistant to {profile.name}&apos;s competitor data. Answers come with the same evidence links you see here.
      </p>
      {admin && <p className="text-muted-foreground">As an admin you see everyone&apos;s tokens and connected apps in this agency.</p>}
      <ConnectorUrlCard url={`${webEnv().appUrl}/mcp`} />
      <AccessTokensCard
        canCreate={!agency}
        scopes={agency ? [] : grantableScopes(ctx.role)}
        tokens={tokens.items}
        showOwner={admin}
        createAction={createClientTokenAction}
        revokeAction={revokeClientTokenAction}
        hidden={hidden}
        note={
          agency ? (
            <p className="rounded-lg bg-muted-surface p-3 text-ink">
              Agency-wide tokens live under{' '}
              <Link href="/agency/ai" className="font-semibold text-primary-soft-text underline">
                AI connections
              </Link>{' '}
              in the agency menu.
            </p>
          ) : undefined
        }
      />
      <ConnectedAppsCard grants={grants.items} showOwner={admin} revokeAction={revokeClientGrantAction} hidden={hidden} />
    </>
  );
}
