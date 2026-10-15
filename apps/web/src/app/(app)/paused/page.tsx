import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth-card';
import { SignOutButton } from '@/components/sign-out-button';
import { billingStateOf } from '@/server/billing-state';
import { requireContext } from '@/server/current-viewer';
import { themeForViewer } from '@/server/theme';

export const dynamic = 'force-dynamic';

/**
 * Phase 9a, suspended workspace (ruling R20). Account managers are told to ask their admin; client users and guests see
 * the agency's own name and no billing words. Anyone else, or a workspace that is not suspended, is sent on.
 */
export default async function PausedPage() {
  const { viewer, ctx } = await requireContext();
  if ((await billingStateOf(ctx.agencyId)) !== 'suspended') redirect('/');
  if (ctx.role === 'agency_admin') redirect('/agency/settings/billing');
  const { branding } = await themeForViewer(viewer);
  const text =
    ctx.role === 'account_manager'
      ? "Your agency's account needs attention. Please contact your agency admin."
      : `This workspace is temporarily unavailable. Please contact ${branding.displayName}.`;
  return (
    <AuthCard branding={branding} title="Temporarily unavailable">
      <p className="text-ink">{text}</p>
      {viewer.kind === 'user' && (
        <div className="mt-4">
          <SignOutButton />
        </div>
      )}
    </AuthCard>
  );
}
