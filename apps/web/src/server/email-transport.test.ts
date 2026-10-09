import { describe, expect, it } from 'vitest';
import { webEmailTransport } from './email-transport';

const ledger = { recordLlmCall: async () => {}, recordVendorCall: async () => {} } as never;

describe('webEmailTransport (Review Focus 4)', () => {
  it('logs to the console while the guard is on, even with a Postmark token', () => {
    expect(webEmailTransport(true, { POSTMARK_SERVER_TOKEN: 'tok' } as unknown as NodeJS.ProcessEnv, ledger).kind).toBe('console');
  });

  it('keeps the normal choice with the guard off', () => {
    expect(webEmailTransport(false, { POSTMARK_SERVER_TOKEN: 'tok' } as unknown as NodeJS.ProcessEnv, ledger).kind).toBe('postmark');
    expect(webEmailTransport(false, {} as NodeJS.ProcessEnv, ledger).kind).toBe('file');
  });
});
