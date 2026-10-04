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
  competitorName: string;
  headline: string;
  whatChanged: string;
  whyItMatters: string;
  recommendedAction: string;
  effort: 'L' | 'M' | 'H';
  impact: 'L' | 'M' | 'H';
  link: string | null;
}
export interface BriefEmailProps extends Base {
  deliveryDate: string;
  kind: 'standard' | 'quiet';
  summary: string;
  items: BriefEmailItem[];
  trend: TrendSnapshot | null;
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
export type EmailPayload =
  | { template: 'alert'; props: AlertEmailProps }
  | { template: 'alert_digest'; props: DigestEmailProps }
  | { template: 'agency_notice'; props: AgencyNoticeProps }
  | { template: 'brief'; props: BriefEmailProps }
  | { template: 'trend_report'; props: TrendReportEmailProps };
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}
