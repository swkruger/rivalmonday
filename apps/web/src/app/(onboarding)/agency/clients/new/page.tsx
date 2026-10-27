import { isAgencyRole } from '@cs/core';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { themeForViewer } from '@/server/theme';
import { verticalOptions } from '@/server/verticals';
import { createClientAction, findBusinessAction } from './actions';
import { NewClientFlow } from './new-client-flow';
import { createVerticalAction, draftVerticalAction } from './vertical-actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Add a client' };

/** Steps 1-2 of the client flow (16 §6): details, then find the business. Agency staff who cover all clients; everyone else 404. */
export default async function NewClientPage() {
  const { ctx, viewer } = await requireContext();
  if (!isAgencyRole(ctx.role) || ctx.clientScope !== 'all') notFound();
  const [guides, { branding }, verticals] = await Promise.all([helpGuides(ctx, 'agency'), themeForViewer(viewer), verticalOptions()]);
  return (
    <NewClientFlow
      kind="client" agency={{ name: branding.displayName, logoUrl: branding.logoUrl }} admin={ctx.role === 'agency_admin'}
      verticals={verticals} verticalActions={{ draft: draftVerticalAction, create: createVerticalAction }}
      find={findBusinessAction} create={createClientAction} canUpgrade={ctx.role === 'agency_admin'}
      guide={guides.has('page:agency.clients.new')}
    />
  );
}
