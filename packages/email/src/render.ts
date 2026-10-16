import { render } from '@react-email/render';
import { createElement, type ReactElement } from 'react';
import { AgencyInviteEmail, agencyInviteSubject } from './templates/agency-invite';
import { AgencyWelcomeEmail, agencyWelcomeSubject } from './templates/agency-welcome';
import { OnboardingTipEmail, onboardingTipSubject } from './templates/onboarding-tip';
import { PlatformSignupNoticeEmail, platformSignupNoticeSubject } from './templates/platform-signup-notice';
import { AgencyNoticeEmail } from './templates/agency-notice';
import { AlertEmail, alertSubject } from './templates/alert';
import { BillingNoticeEmail, billingNoticeSubject } from './templates/billing-notice';
import { AgencyClientBillingNoticeEmail, agencyClientBillingNoticeSubject } from './templates/agency-client-billing-notice';
import { ClientBillingNoticeEmail, clientBillingNoticeSubject } from './templates/client-billing-notice';
import { BriefEmail, briefSubject } from './templates/brief';
import { DigestEmail, digestSubject } from './templates/digest';
import { PlatformCostLowEmail, platformCostLowSubject } from './templates/platform-cost-low';
import { SignInEmail, signInSubject } from './templates/sign-in';
import { SupportSessionStartedEmail, supportSessionStartedSubject } from './templates/support-session-started';
import { TrendReportEmail, trendReportSubject } from './templates/trend-report';
import type { EmailPayload, RenderedEmail } from './types';

function element(p: EmailPayload): { el: ReactElement; subject: string } {
  switch (p.template) {
    case 'alert':
      return { el: createElement(AlertEmail, p.props), subject: alertSubject(p.props) };
    case 'alert_digest':
      return { el: createElement(DigestEmail, p.props), subject: digestSubject(p.props) };
    case 'agency_notice':
      return { el: createElement(AgencyNoticeEmail, p.props), subject: p.props.title };
    case 'brief':
      return { el: createElement(BriefEmail, p.props), subject: briefSubject(p.props) };
    case 'sign_in':
      return { el: createElement(SignInEmail, p.props), subject: signInSubject(p.props) };
    case 'support_session_started':
      return { el: createElement(SupportSessionStartedEmail, p.props), subject: supportSessionStartedSubject() };
    case 'platform_cost_low':
      return { el: createElement(PlatformCostLowEmail, p.props), subject: platformCostLowSubject(p.props) };
    case 'billing_notice':
      return { el: createElement(BillingNoticeEmail, p.props), subject: billingNoticeSubject(p.props.kind) };
    case 'client_billing_notice':
      return { el: createElement(ClientBillingNoticeEmail, p.props), subject: clientBillingNoticeSubject(p.props) };
    case 'agency_client_billing_notice':
      return { el: createElement(AgencyClientBillingNoticeEmail, p.props), subject: agencyClientBillingNoticeSubject(p.props) };
    case 'agency_invite':
      return { el: createElement(AgencyInviteEmail, p.props), subject: agencyInviteSubject() };
    case 'agency_welcome':
      return { el: createElement(AgencyWelcomeEmail, p.props), subject: agencyWelcomeSubject() };
    case 'onboarding_tip':
      return { el: createElement(OnboardingTipEmail, p.props), subject: onboardingTipSubject(p.props) };
    case 'platform_signup_notice':
      return { el: createElement(PlatformSignupNoticeEmail, p.props), subject: platformSignupNoticeSubject(p.props) };
    case 'trend_report':
      return { el: createElement(TrendReportEmail, p.props), subject: trendReportSubject(p.props) };
    default:
      throw new Error(`No email template for ${(p as { template: string }).template}`);
  }
}

export async function renderEmail(payload: EmailPayload): Promise<RenderedEmail> {
  const { el, subject } = element(payload);
  const [html, text] = await Promise.all([render(el), render(el, { plainText: true })]);
  return { subject: subject.slice(0, 200), html, text };
}
