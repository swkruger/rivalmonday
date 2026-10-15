import type { TrendReportData, TrendSnapshot } from '@cs/db';
import type { Branding } from './branding';

interface Base {
  branding: Branding;
  recipientName: string | null;
  clientName: string;
}
export interface AlertEmailProps extends Base {
  competitorName: string;
  headline: string;
  body: string;
  /** YYYY-MM-DD, client-local. */
  detectedOn: string;
  link: string;
}
export interface DigestEmailProps extends Base {
  date: string;
  alerts: { competitorName: string; headline: string; body: string; link: string }[];
  link: string;
}
export interface AgencyNoticeProps extends Base {
  notice: 'am_alert' | 'brief_ready' | 'brief_failed' | 'brief_overdue';
  title: string;
  lines: string[];
  link: string;
  actionLabel: string;
}
/** A client-facing brief item: there is deliberately no upsell field (spec §8.5 — agency-only). */
export interface BriefEmailItem {
  /** 'self' = about the client's own business: no competitor name is shown. */
  subject?: 'self' | 'competitor';
  competitorName: string;
  headline: string;
  whatChanged: string;
  whyItMatters: string;
  recommendedAction: string;
  effort: 'L' | 'M' | 'H';
  impact: 'L' | 'M' | 'H';
  link: string | null;
}
/** The one formatted view of a scorecard (built by `scorecardModel` in @cs/engine) rendered by web, email and PDF. All strings are display-ready. */
export interface ScorecardModel {
  tiles: { label: string; value: string; sub: string; trend: 'up' | 'down' | null; trendText: string | null }[];
  table: { headers: string[]; rows: { cells: string[]; self: boolean; tier: 'top' | 'watch' | 'minor' | null }[] };
  openFirstMoves: string[];
}
export interface BriefEmailProps extends Base {
  deliveryDate: string;
  kind: 'standard' | 'quiet' | 'starting_point';
  summary: string;
  items: BriefEmailItem[];
  trend: TrendSnapshot | null;
  /** Starting point and quiet weeks; null otherwise. */
  scorecard?: ScorecardModel | null;
  /** Null in the PDF variant. */
  link: string | null;
  pdfLink: string | null;
  signOff: string | null;
}
export interface TrendReportEmailProps extends Base {
  quarter: string;
  data: TrendReportData;
  link: string | null;
  pdfLink: string | null;
}
export interface SignInEmailProps {
  branding: Branding;
  url: string;
  expiresMinutes: number;
}
export interface SupportSessionStartedProps {
  branding: Branding;
  recipientName: string | null;
  platformAdminName: string;
  /** Human-readable date, e.g. "October 13, 2026". */
  date: string;
  reason: string;
}
export interface PlatformCostLowProps {
  branding: Branding;
  label: string;
  /** Already formatted, e.g. "$12.34" or "7,099 credits". */
  amountText: string;
  daysLeft: number | null;
  billingUrl: string | null;
  costsUrl: string;
}
export type EmailPayload =
  | { template: 'alert'; props: AlertEmailProps }
  | { template: 'alert_digest'; props: DigestEmailProps }
  | { template: 'agency_notice'; props: AgencyNoticeProps }
  | { template: 'brief'; props: BriefEmailProps }
  | { template: 'trend_report'; props: TrendReportEmailProps }
  | { template: 'sign_in'; props: SignInEmailProps }
  | { template: 'support_session_started'; props: SupportSessionStartedProps }
  | { template: 'platform_cost_low'; props: PlatformCostLowProps };
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}
