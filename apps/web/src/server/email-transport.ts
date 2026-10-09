import type { LedgerSink } from '@cs/core';
import { createConsoleTransport, createEmailTransportFromEnv, type EmailTransport } from '@cs/email';

/** Spec §5.5: while the dev-panel guard is on, sign-in emails go to the console — never Postmark, never a file. */
export function webEmailTransport(guardOn: boolean, env: NodeJS.ProcessEnv, ledger: LedgerSink): EmailTransport {
  return guardOn ? createConsoleTransport() : createEmailTransportFromEnv(env, ledger);
}
