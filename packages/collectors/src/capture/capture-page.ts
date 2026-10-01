import type { CaptureStatus } from '@cs/core';
import { type Db, trackedPage } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { recordWebCapture } from '../evidence/recorder';
import type { Renderer } from '../web/renderer';

export async function capturePage(
  deps: { db: Db; store: ObjectStore; renderer: Renderer },
  trackedPageId: string,
): Promise<{ status: CaptureStatus | 'missing' }> {
  const [tp] = await deps.db.select().from(trackedPage).where(eq(trackedPage.id, trackedPageId)).limit(1);
  if (!tp || !tp.active) return { status: 'missing' };
  const page = await deps.renderer.render(tp.url);
  try {
    const r = await recordWebCapture({ db: deps.db, store: deps.store }, { trackedPage: { id: tp.id, competitorId: tp.competitorId, url: tp.url }, page });
    return { status: r.status };
  } finally {
    await page.close();
  }
}
