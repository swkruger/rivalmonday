import { isAgencyRole } from '@cs/core';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { themeForViewer } from '@/server/theme';
import { verticalOptions } from '@/server/verticals';
import { findBusinessAction } from '../../clients/new/actions';
import { NewClientFlow } from '../../clients/new/new-client-flow';
import { createVerticalAction, draftVerticalAction } from '../../clients/new/vertical-actions';
import { createProspectAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Add a prospect' };

/** The client flow's first two steps for a business being pitched (16 §6: prospects skip billing). */
export default async function NewProspectPage() {
  const { ctx, viewer } = await requireContext();
  if (!isAgencyRole(ctx.role) || ctx.clientScope !== 'all') notFound();
  const [guides, { branding }, verticals] = await Promise.all([helpGuides(ctx, 'agency'), themeForViewer(viewer), verticalOptions()]);
  return (
    <NewClientFlow
      kind="prospect" agency={{ name: branding.displayName, logoUrl: branding.logoUrl }} admin={ctx.role === 'agency_admin'}
      verticals={verticals} verticalActions={{ draft: draftVerticalAction, create: createVerticalAction }}
      find={findBusinessAction} create={createProspectAction} canUpgrade={ctx.role === 'agency_admin'}
      guide={guides.has('page:agency.prospects.new')}
    />
  );
}
