import { getAgencyBranding } from '@cs/tools';
import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { requireContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { timezoneOptions } from '@/server/timezones';
import { callTool } from '@/server/tools';
import { firstOpenStep, isStep, STEP_TITLES, STEPS, type StepStates } from './flow';
import { Stepper } from './stepper';
import { BrandingStep } from './steps/branding';
import { PlanStep, type PlanSummary } from './steps/plan';
import { ProfileStep, type ProfileValues } from './steps/profile';
import { TeamStep } from './steps/team';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Set up your agency' };

interface Status {
  steps: StepStates & { first_client: string };
  dismissed: boolean;
  completed: boolean;
}

/** Agency admins only (everyone else 404). A finished or dismissed onboarding has nothing left to show: back to `/agency`. */
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const { ctx } = await requireContext();
  if (ctx.role !== 'agency_admin') notFound();
  const status = await callTool<Status>(ctx, 'get_onboarding_status', {});
  if (status.completed || status.dismissed) redirect('/agency');

  const { step: requested } = await searchParams;
  const step = isStep(requested) ? requested : firstOpenStep(status.steps);

  let body: React.ReactNode;
  if (step === 'profile') {
    const profile = await callTool<ProfileValues>(ctx, 'get_agency_profile', {});
    body = <ProfileStep initial={profile} timezones={timezoneOptions(profile.timezone)} />;
  } else if (step === 'team') {
    body = <TeamStep />;
  } else if (step === 'plan') {
    body = <PlanStep summary={await callTool<PlanSummary>(ctx, 'get_billing_summary', {})} />;
  } else {
    const { stored, resolved } = await getAgencyBranding(dbs().service, ctx);
    body = <BrandingStep initial={stored} agencyName={resolved.displayName} />;
  }

  return (
    <>
      <PageHeader title={STEP_TITLES[step]} step={{ n: STEPS.indexOf(step) + 1, of: STEPS.length }} />
      <Stepper current={step} steps={status.steps} />
      {body}
    </>
  );
}
