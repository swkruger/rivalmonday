import type { AgencyBranding } from '@cs/db';
import type { Branding } from '@cs/email';
import { notFound, redirect } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';
import { firstOpenStep, isStep, type StepStates } from './flow';
import { AboutStep, type AboutValues } from './steps/about';
import { BrandStep } from './steps/brand';
import { DoneStep } from './steps/done';
import { TeamStep } from './steps/team';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Set up your agency' };

const HELP_KEY = 'page:account.onboarding';

interface Status {
  steps: StepStates & { first_client: string };
  dismissed: boolean;
  completed: boolean;
}
interface Profile extends AboutValues { timezone: string }

const firstNameOf = (full: string) => full.trim().split(/\s+/)[0] ?? '';

/** Agency admins only (everyone else 404). A finished or dismissed onboarding has nothing left to show: back to `/agency`. */
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const { ctx, viewer } = await requireContext();
  if (ctx.role !== 'agency_admin') notFound();
  const status = await callTool<Status>(ctx, 'get_onboarding_status', {});
  // Step 1 is required: until it is saved the page shows it, whatever else is finished or requested.
  const profileOpen = status.steps.profile !== 'done';
  if (!profileOpen && (status.completed || status.dismissed)) redirect('/agency');

  // /onboarding is outside /agency, /c and /platform, so the guide drawer reads the agency scope (helpScopeOf); read the same one here.
  const guide = (await helpGuides(ctx, 'agency')).has(HELP_KEY);
  const { step: requested } = await searchParams;
  const step = profileOpen ? 'profile' : isStep(requested) ? requested : firstOpenStep(status.steps);
  const [profile, { stored, resolved }] = await Promise.all([
    callTool<Profile>(ctx, 'get_agency_profile', {}),
    callTool<{ stored: AgencyBranding; resolved: Branding }>(ctx, 'get_agency_branding', {}),
  ]);

  if (step === 'profile') {
    // The sign-up email is the contact email until the admin changes it.
    const email = profile.contactEmail || (viewer.kind === 'user' ? viewer.email : '');
    return <AboutStep initial={{ ...profile, contactEmail: email }} guide={guide} />;
  }
  if (step === 'team') return <TeamStep agencyName={resolved.displayName} inviterName={profile.contactName} guide={guide} />;
  if (step === 'branding') return <BrandStep initial={stored} agencyName={profile.name} guide={guide} />;

  const team = await callTool<{ members: unknown[]; invitations: unknown[] }>(ctx, 'get_team', {});
  const invited = team.invitations.length + Math.max(team.members.length - 1, 0);
  const brand = [stored.logoUrl && 'logo', stored.primary && 'colour'].filter(Boolean).join(' and ');
  const summary = {
    agency: profile.name,
    contact: [profile.contactName, profile.phone].filter(Boolean).join(' · '),
    team: invited > 0 ? `${invited} ${invited === 1 ? 'invite' : 'invites'} sent` : 'No invites yet',
    brand: brand ? `${brand[0]!.toUpperCase()}${brand.slice(1)} set` : 'Default look',
    brandColor: stored.primary && /^#[0-9a-f]{6}$/i.test(stored.primary) ? stored.primary : null,
  };
  return <DoneStep firstName={firstNameOf(profile.contactName)} summary={summary} guide={guide} />;
}
