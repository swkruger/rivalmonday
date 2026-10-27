import { grantableScopes, hasChannel, isAgencyRole } from '@cs/core';
import type { ApiTokenView, OAuthGrantView } from '@cs/tools';
import { notFound } from 'next/navigation';
import { AccessTokensCard, ConnectedAppsCard, ConnectorUrlCard } from '@/components/ai-connections';
import { EmptyState } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { themeForViewer } from '@/server/theme';
import { webEnv } from '@/server/env';
import { callTool } from '@/server/tools';
import { viewerTimeZone } from '@/server/viewer-tz';
import { createAgencyTokenAction, revokeAgencyGrantAction, revokeAgencyTokenAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'AI connections' };

const HELP_KEY = 'page:agency.settings.ai';
const COPY = PAGE_COPY['agency.settings.ai'];

/** Phase 6a: agency-wide AI connections (P10). Agency roles only; admins see every member's tokens and apps. */
export default async function AgencyAiConnectionsPage() {
  const { viewer, ctx } = await requireContext();
  if (!isAgencyRole(ctx.role) || !hasChannel(ctx, 'mcp')) notFound(); // 7a2 D13: plan without MCP → 404
  const [tokens, grants, guides] = await Promise.all([
    callTool<{ items: ApiTokenView[] }>(ctx, 'list_api_tokens', {}),
    callTool<{ items: OAuthGrantView[] }>(ctx, 'list_oauth_grants', {}),
    helpGuides(ctx, 'agency'),
  ]);
  const admin = ctx.role === 'agency_admin';
  const tz = await viewerTimeZone();

  // 15a §2.10: the Claude Code command names the viewer's agency (cached branding read shared with the shell).
  const { displayName } = (await themeForViewer(viewer)).branding;

  return (
    <>
      <PageHeader
        title="AI connections"
        breadcrumb={[{ label: 'Agency settings', href: '/agency/settings' }, { label: 'AI connections' }]}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      {admin && <p className="text-muted-ink">As an admin you see everyone&apos;s tokens and connected apps in this agency.</p>}
      <ConnectorUrlCard url={`${webEnv().appUrl}/mcp`} displayName={displayName} help={<HelpTip tip="agency.settings.ai.connector" />} />
      <AccessTokensCard
        canCreate
        scopes={grantableScopes(ctx.role)}
        tokens={tokens.items}
        showOwner={admin}
        tz={tz}
        help={
          <>
            <HelpTip tip="agency.settings.ai.tokens" />
            <HelpTip tip="agency.settings.ai.levels" />
          </>
        }
        empty={<EmptyState {...COPY.empty.noTokens} guideAnchor="common-questions" />}
        createAction={createAgencyTokenAction}
        revokeAction={revokeAgencyTokenAction}
      />
      <ConnectedAppsCard
        grants={grants.items}
        showOwner={admin}
        tz={tz}
        revokeAction={revokeAgencyGrantAction}
        help={<HelpTip tip="agency.settings.ai.apps" />}
        empty={<EmptyState {...COPY.empty.noApps} guideAnchor="how-to-use-it" />}
      />
    </>
  );
}
