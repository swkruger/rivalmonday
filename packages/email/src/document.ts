import { render } from '@react-email/render';
import { createElement } from 'react';
import { BriefEmail } from './templates/brief';
import { BriefReportDocument } from './templates/brief-report';
import { TrendReportEmail } from './templates/trend-report';
import type { BriefEmailProps, BriefReportDocumentProps, TrendReportEmailProps } from './types';

export { briefReportTitle } from './templates/brief-report';

export interface PdfMeta {
  title: string;
  author: string;
  subject: string;
}
/** Implemented by the worker with Playwright + pdf-lib (Task 16); only `allowUrls` may be fetched while rendering. */
export type PdfRenderer = (html: string, meta: PdfMeta, opts: { allowUrls: string[] }) => Promise<Uint8Array>;

export const renderBriefDocument = (props: BriefEmailProps) => render(createElement(BriefEmail, { ...props, variant: 'document' }));
export const renderTrendReportDocument = (props: TrendReportEmailProps) => render(createElement(TrendReportEmail, { ...props, variant: 'document' }));
/**
 * The brief PDF document (spec §4.8): a starting point renders exactly today's document from `legacy`; a weekly brief
 * renders the layout-"C" report, or the cover over today's body when it has no stored report.
 */
export const renderBriefReportDocument = (props: BriefReportDocumentProps) => {
  if (props.kind === 'starting_point') {
    if (!props.legacy) throw new Error('renderBriefReportDocument: a starting point needs its legacy props');
    return renderBriefDocument(props.legacy);
  }
  return render(createElement(BriefReportDocument, props));
};
