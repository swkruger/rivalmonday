import { describe, expect, it } from 'vitest';
import { parseDeliverArgs } from './deliver-args';

const U = '00000000-0000-4000-8000-0000000000a1';
describe('parseDeliverArgs', () => {
  it('parses contact-add with quiet hours and scope', () => {
    expect(parseDeliverArgs(['contact-add', '--agency', U, '--role', 'account_manager', '--email', 'am@example.com', '--quiet', '21:00-07:00', '--scope', U])).toEqual({
      cmd: 'contact-add', agency: U, role: 'account_manager', email: 'am@example.com', quiet: { start: '21:00', end: '07:00' }, scope: [U],
    });
  });
  it('parses settings, time-taking commands, send, pdf and link', () => {
    expect(parseDeliverArgs(['settings', '--client', U, '--alert-mode', 'direct', '--auto-send', 'on'])).toEqual({ cmd: 'settings', client: U, alertMode: 'direct', autoSend: true });
    expect(parseDeliverArgs(['deliver', '--now', '2026-11-02T13:05:00Z'])).toEqual({ cmd: 'deliver', now: new Date('2026-11-02T13:05:00Z') });
    expect(parseDeliverArgs(['send', '--brief', U])).toEqual({ cmd: 'send', brief: U });
    expect(parseDeliverArgs(['pdf', '--report', U, '--out', 'r.pdf'])).toEqual({ cmd: 'pdf', report: U, out: 'r.pdf' });
    expect(parseDeliverArgs(['alert-dry', '--client', U, '--event', U])).toEqual({ cmd: 'alert-dry', client: U, event: U });
    expect(parseDeliverArgs(['link', '--verify', 'abc.def'])).toEqual({ cmd: 'link', verify: 'abc.def' });
  });
  it('rejects unknown commands and bad values', () => {
    for (const bad of [[], ['launch'], ['send'], ['send', '--brief', 'nope'], ['settings', '--client', U, '--alert-mode', 'loud'], ['contact-add', '--agency', U, '--role', 'boss', '--email', 'x@example.com'],
      ['contact-add', '--agency', U, '--role', 'client_owner', '--email', 'x@example.com', '--quiet', '9pm-7am'], ['deliver', '--now', 'yesterday'], ['pdf', '--brief', U]]) {
      expect(parseDeliverArgs(bad)).toHaveProperty('error');
    }
  });
});
