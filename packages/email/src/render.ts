import { render } from '@react-email/render';
import { createElement, type ReactElement } from 'react';
import { AgencyNoticeEmail } from './templates/agency-notice';
import { AlertEmail, alertSubject } from './templates/alert';
import { DigestEmail, digestSubject } from './templates/digest';
import type { EmailPayload, RenderedEmail } from './types';

function element(p: EmailPayload): { el: ReactElement; subject: string } {
  switch (p.template) {
    case 'alert':
      return { el: createElement(AlertEmail, p.props), subject: alertSubject(p.props) };
    case 'alert_digest':
      return { el: createElement(DigestEmail, p.props), subject: digestSubject(p.props) };
    case 'agency_notice':
      return { el: createElement(AgencyNoticeEmail, p.props), subject: p.props.title };
    default:
      throw new Error(`No email template for ${(p as { template: string }).template}`);
  }
}

export async function renderEmail(payload: EmailPayload): Promise<RenderedEmail> {
  const { el, subject } = element(payload);
  const [html, text] = await Promise.all([render(el), render(el, { plainText: true })]);
  return { subject: subject.slice(0, 200), html, text };
}
