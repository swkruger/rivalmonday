import { capture } from '@cs/db';
import { eq } from 'drizzle-orm';
import { diffVendorCapture } from './structured/vendor-diff';
import { diffWebCapture, type EngineDeps } from './web/diff-stage';

/** The engine-diff job's entry point: web captures go through the web diff, every other source through its structured differ. */
export async function diffCapture(deps: EngineDeps, captureId: string): Promise<{ ran: boolean; changeIds: string[] }> {
  const [cap] = await deps.db.select({ source: capture.source }).from(capture).where(eq(capture.id, captureId)).limit(1);
  if (!cap) throw new Error(`capture ${captureId} not found`);
  const o = cap.source === 'web' ? await diffWebCapture(deps, captureId) : await diffVendorCapture(deps, captureId);
  return o.ran ? { ran: true, changeIds: o.result.changeIds } : { ran: false, changeIds: [] };
}
