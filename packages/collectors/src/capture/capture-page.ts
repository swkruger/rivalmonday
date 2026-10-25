import type { CaptureStatus } from '@cs/core';
import { type Db, trackedPage } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { recordWebCapture } from '../evidence/recorder';
import type { PoliteRenderer } from '../web/polite';
import type { RenderedPage, Renderer } from '../web/renderer';

export type CapturePageResult = { status: CaptureStatus | 'missing' | 'deferred'; captureId?: string; retryInMs?: number };

/** 7c2: with a polite renderer the capture never sleeps past its host's slot; it returns `deferred` + `retryInMs` instead. */
export async function capturePage(
  deps: { db: Db; store: ObjectStore; renderer: Renderer & Partial<Pick<PoliteRenderer, 'renderOrDefer'>> },
  trackedPageId: string,
): Promise<CapturePageResult> {
  const [tp] = await deps.db.select().from(trackedPage).where(eq(trackedPage.id, trackedPageId)).limit(1);
  if (!tp || !tp.active) return { status: 'missing' };
  let page: RenderedPage;
  if (deps.renderer.renderOrDefer) {
    const r = await deps.renderer.renderOrDefer(tp.url);
    if ('deferred' in r) return { status: 'deferred', retryInMs: r.retryInMs };
    page = r.page;
  } else {
    page = await deps.renderer.render(tp.url);
  }
  try {
    const r = await recordWebCapture({ db: deps.db, store: deps.store }, { trackedPage: { id: tp.id, competitorId: tp.competitorId, url: tp.url }, page });
    return { status: r.status, captureId: r.captureId };
  } finally {
    await page.close();
  }
}
