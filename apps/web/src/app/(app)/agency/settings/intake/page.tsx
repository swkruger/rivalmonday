import { notFound } from 'next/navigation';
import { IntakeLinkCard, type IntakeLinkState } from '@/components/agency/intake-link-card';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { saveIntakeSlugAction, setIntakeEnabledAction } from './actions';

export const dynamic = 'force-dynamic';

/** Phase 11c §5 (ruling G): agency admins only; any other role, and a support session, gets a 404. */
export default async function IntakeSettingsPage() {
  const { viewer, ctx } = await requireContext();
  if (viewer.kind !== 'user' || ctx.role !== 'agency_admin') notFound();
  const link = await callTool<IntakeLinkState>(ctx, 'get_intake_link', {});
  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">Intake link</h1>
      <p className="text-muted-foreground">A public page where businesses ask for a free competitor snapshot. New requests appear under Leads.</p>
      <IntakeLinkCard link={link} save={saveIntakeSlugAction} toggle={setIntakeEnabledAction} />
    </>
  );
}
