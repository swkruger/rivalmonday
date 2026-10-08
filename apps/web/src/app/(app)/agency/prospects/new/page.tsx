import { isAgencyRole } from '@cs/core';
import { notFound } from 'next/navigation';
import { ClientProfileForm } from '@/components/client-profile-form';
import { requireContext } from '@/server/current-viewer';
import { timezoneOptions } from '@/server/timezones';
import { verticalOptions } from '@/server/verticals';
import { createProspectAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function NewProspectPage() {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role) || ctx.clientScope !== 'all') notFound();
  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">Add a prospect</h1>
      <p className="text-muted-foreground">Profile first — keywords and a service area let us find their competitors.</p>
      <ClientProfileForm mode="create" submitLabel="Create prospect" action={createProspectAction} verticals={await verticalOptions()} timezoneOptions={timezoneOptions('America/Chicago')} />
    </>
  );
}
