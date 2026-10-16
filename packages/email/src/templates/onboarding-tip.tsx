/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Text } from 'react-email';
import { button, Layout } from '../layout';
import type { OnboardingTipProps } from '../types';

/** Phase 10 Task 11 (copy is binding). Rival Monday branded. */
const BODY: Record<OnboardingTipProps['nextStep'], string> = {
  profile: 'Add your contact details so we can reach you about your account.',
  team: "Invite the people who manage your clients — they'll get their own sign-in.",
  plan: "Check your plan, and add a payment method whenever you're ready.",
  branding: 'Add your logo and colours so client reports look like yours.',
  first_client: "Add your first client and we'll start watching their competitors this week.",
};

export const onboardingTipSubject = (p: Pick<OnboardingTipProps, 'day' | 'agencyName'>): string =>
  p.day === 1 ? 'Your Rival Monday setup: next step' : p.day === 3 ? `Two minutes to finish setting up ${p.agencyName}` : 'Your first competitor brief is one client away';

export const onboardingTipBody = (nextStep: OnboardingTipProps['nextStep']) => BODY[nextStep];

export function OnboardingTipEmail(p: OnboardingTipProps) {
  const subject = onboardingTipSubject(p);
  return (
    <Layout
      branding={p.branding}
      title={subject}
      preview={onboardingTipBody(p.nextStep)}
      footer={`You're getting this because you started setting up ${p.agencyName}. Unsubscribe from setup tips: ${p.unsubscribeUrl}`}
    >
      <Text>{onboardingTipBody(p.nextStep)}</Text>
      <Button href={p.url} style={button(p.branding)}>
        Pick up where you left off
      </Button>
    </Layout>
  );
}
