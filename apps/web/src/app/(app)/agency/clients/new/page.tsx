import { isAgencyRole } from '@cs/core';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { timezoneOptions } from '@/server/timezones';
import { verticalOptions } from '@/server/verticals';
import { createClientAction, createClientFromLookupAction, findBusinessAction } from './actions';
import { LookupStep } from './lookup-step';

export const dynamic = 'force-dynamic';

export default async function NewClientPage() {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role) || ctx.clientScope !== 'all') notFound();
  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">Add a client</h1>
      <p className="text-muted-foreground">Next you’ll pick 3–5 competitors to monitor.</p>
      <LookupStep find={findBusinessAction} createFromLookup={createClientFromLookupAction} createByHand={createClientAction} verticals={await verticalOptions()} timezoneOptions={timezoneOptions('America/Chicago')} canUpgrade={ctx.role === 'agency_admin'} />
    </>
  );
}
