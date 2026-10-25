import { render } from '@react-email/render';
import { createElement, type ReactElement } from 'react';
import { AgencyHoldEmail, agencyHoldSubject } from './templates/agency-hold';
import { AgencyInviteEmail, agencyInviteSubject } from './templates/agency-invite';
import { AgencyWelcomeEmail, agencyWelcomeSubject } from './templates/agency-welcome';
import { OnboardingTipEmail, onboardingTipSubject } from './templates/onboarding-tip';
import { PlatformSignupNoticeEmail, platformSignupNoticeSubject } from './templates/platform-signup-notice';
import { AgencyNoticeEmail } from './templates/agency-notice';
import { AlertEmail, alertSubject } from './templates/alert';
import { BillingNoticeEmail, billingNoticeSubject } from './templates/billing-notice';
import { AgencyClientBillingNoticeEmail, agencyClientBillingNoticeSubject } from './templates/agency-client-billing-notice';
import { ClientBillingNoticeEmail, clientBillingNoticeSubject } from './templates/client-billing-notice';
import { ClientInviteEmail, clientInviteSubject } from './templates/client-invite';
import { CompetitorReviewEmail, competitorReviewSubject } from './templates/competitor-review';
import { BriefEmail, briefSubject } from './templates/brief';
import { DigestEmail, digestSubject } from './templates/digest';
import { LeadConfirmationEmail, leadConfirmationSubject } from './templates/lead-confirmation';
import { LeadDeclinedEmail, leadDeclinedSubject } from './templates/lead-declined';
import { LeadNewEmail, leadNewSubject } from './templates/lead-new';
import { LeadVerifyEmail, leadVerifySubject } from './templates/lead-verify';
import { PlatformCostLowEmail, platformCostLowSubject } from './templates/platform-cost-low';
import { PlatformOpsAlertEmail, platformOpsAlertSubject } from './templates/platform-ops-alert';
import { PlatformSpendAlertEmail, platformSpendAlertSubject } from './templates/platform-spend-alert';
import { SignInEmail, signInSubject } from './templates/sign-in';
import { TeamInviteEmail, teamInviteSubject } from './templates/team-invite';
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
    case 'agency_hold':
      return { el: createElement(AgencyHoldEmail, p.props), subject: agencyHoldSubject(p.props.kind, p.props.agencyName) };
    case 'platform_spend_alert':
      return { el: createElement(PlatformSpendAlertEmail, p.props), subject: platformSpendAlertSubject(p.props) };
    case 'platform_ops_alert':
      return { el: createElement(PlatformOpsAlertEmail, p.props), subject: platformOpsAlertSubject(p.props) };
    case 'platform_cost_low':
      return { el: createElement(PlatformCostLowEmail, p.props), subject: platformCostLowSubject(p.props) };
    case 'billing_notice':
      return { el: createElement(BillingNoticeEmail, p.props), subject: billingNoticeSubject(p.props.kind) };
    case 'client_billing_notice':
      return { el: createElement(ClientBillingNoticeEmail, p.props), subject: clientBillingNoticeSubject(p.props) };
    case 'client_invite':
      return { el: createElement(ClientInviteEmail, p.props), subject: clientInviteSubject(p.props) };
    case 'team_invite':
      return { el: createElement(TeamInviteEmail, p.props), subject: teamInviteSubject(p.props) };
    case 'competitor_review':
      return { el: createElement(CompetitorReviewEmail, p.props), subject: competitorReviewSubject(p.props) };
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
    case 'lead_verify':
      return { el: createElement(LeadVerifyEmail, p.props), subject: leadVerifySubject() };
    case 'lead_confirmation':
      return { el: createElement(LeadConfirmationEmail, p.props), subject: leadConfirmationSubject(p.props) };
    case 'lead_declined':
      return { el: createElement(LeadDeclinedEmail, p.props), subject: leadDeclinedSubject(p.props) };
    case 'lead_new':
      return { el: createElement(LeadNewEmail, p.props), subject: leadNewSubject(p.props) };
    default:
      throw new Error(`No email template for ${(p as { template: string }).template}`);
  }
}

export async function renderEmail(payload: EmailPayload): Promise<RenderedEmail> {
  const { el, subject } = element(payload);
  const [html, text] = await Promise.all([render(el), render(el, { plainText: true, ...(payload.template === 'competitor_review' ? { htmlToTextOptions: { selectors: [{ selector: 'ul', options: { itemPrefix: '- ' } }] } } : {}) })]);
  return { subject: subject.slice(0, 200), html, text };
}
