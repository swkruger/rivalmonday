import { grantableScopes, hasChannel, isAgencyRole } from '@cs/core';
import type { ApiTokenView, ClientProfile, OAuthGrantView } from '@cs/tools';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AccessTokensCard, ConnectedAppsCard, ConnectorUrlCard } from '@/components/ai-connections';
import { clientSettingsCrumbs } from '@/components/client-crumbs';
import { EmptyState } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { hasClientSettings } from '@/server/client-settings-nav';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { themeForViewer } from '@/server/theme';
import { webEnv } from '@/server/env';
import { callTool } from '@/server/tools';
import { viewerTimeZone } from '@/server/viewer-tz';
import { createClientTokenAction, revokeClientGrantAction, revokeClientTokenAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'AI connection' };

const HELP_KEY = 'page:client.settings.ai';
const COPY = PAGE_COPY['client.settings.ai'];

/** Phase 6a: a client's AI connections. Client roles create client-bound tokens here (P10); agency roles only see this client's lists. */
export default async function AiConnectionsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { viewer, ctx } = await requireContext();
  // Page refusals are 404s, decided before any tool call: signed-link guests never manage tokens (P10), and client
  // roles need the client's `mcp` feature (agency roles bypass it), and every role needs the plan's `mcp` (7a2 D13).
  if (viewer.kind === 'guest' || !hasChannel(ctx, 'mcp')) notFound();
  const [profile, settingsLinked, guides] = await Promise.all([callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }), hasClientSettings(clientId), helpGuides(ctx, 'client', clientId)]);
  const [tokens, grants] = await Promise.all([
    callTool<{ items: ApiTokenView[] }>(ctx, 'list_api_tokens', { clientId }),
    callTool<{ items: OAuthGrantView[] }>(ctx, 'list_oauth_grants', { clientId }),
  ]);
  const agency = isAgencyRole(ctx.role);
  const admin = ctx.role === 'agency_admin';
  const tz = await viewerTimeZone();
  const hidden = { clientId };

  // 15a §2.10: the Claude Code command names the viewer's agency (cached branding read shared with the shell).
  const { displayName } = (await themeForViewer(viewer)).branding;

  return (
    <>
      <PageHeader
        title="AI connection"
        breadcrumb={clientSettingsCrumbs({ id: clientId, name: profile.name }, 'AI connection', settingsLinked)}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      {admin && <p className="text-muted-foreground">As an admin you see everyone&apos;s tokens and connected apps in this agency.</p>}
      <ConnectorUrlCard url={`${webEnv().appUrl}/mcp`} displayName={displayName} help={<HelpTip tip="client.settings.ai.connector" />} />
      <AccessTokensCard
        canCreate={!agency}
        scopes={agency ? [] : grantableScopes(ctx.role)}
        tokens={tokens.items}
        showOwner={admin}
        tz={tz}
        help={
          <>
            <HelpTip tip="client.settings.ai.tokens" />
            <HelpTip tip="client.settings.ai.levels" />
            <HelpTip tip="client.settings.ai.agencyTokens" />
          </>
        }
        empty={<EmptyState {...COPY.empty.noTokens} guideAnchor="common-questions" />}
        createAction={createClientTokenAction}
        revokeAction={revokeClientTokenAction}
        hidden={hidden}
        note={
          agency ? (
            <p className="rounded-lg bg-muted-surface p-3 text-ink">
              Agency-wide tokens live under{' '}
              <Link href="/agency/settings/ai" className="font-semibold text-primary-soft-text underline">
                Agency settings › AI connections
              </Link>
              .
            </p>
          ) : undefined
        }
      />
      <ConnectedAppsCard
        grants={grants.items} showOwner={admin}
        tz={tz} revokeAction={revokeClientGrantAction} hidden={hidden}
        help={<HelpTip tip="client.settings.ai.apps" />}
        empty={<EmptyState {...COPY.empty.noApps} guideAnchor="how-to-use-it" />}
      />
    </>
  );
}
