import { render } from '@react-email/render';
import { createElement } from 'react';
import { BriefEmail } from './templates/brief';
import { TrendReportEmail } from './templates/trend-report';
import type { BriefEmailProps, TrendReportEmailProps } from './types';

export interface PdfMeta {
  title: string;
  author: string;
  subject: string;
}
/** Implemented by the worker with Playwright + pdf-lib (Task 16); only `allowUrls` may be fetched while rendering. */
export type PdfRenderer = (html: string, meta: PdfMeta, opts: { allowUrls: string[] }) => Promise<Uint8Array>;

export const renderBriefDocument = (props: BriefEmailProps) => render(createElement(BriefEmail, { ...props, variant: 'document' }));
export const renderTrendReportDocument = (props: TrendReportEmailProps) => render(createElement(TrendReportEmail, { ...props, variant: 'document' }));
