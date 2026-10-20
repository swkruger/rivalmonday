'use server';
import { revalidatePath } from 'next/cache';
import { requireOperatorContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';

const text = (fd: FormData, k: string) => String(fd.get(k) ?? '');

function payloadOf(fd: FormData): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(text(fd, 'payload'));
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * One action for every control on the review page, told apart by `intent`. Every write is a registered tool through
 * `runTool` (platform staff gate and audit row live in the tool); a refusal reads "Not found".
 */
export async function catalogReviewAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireOperatorContext();
  const intent = text(fd, 'intent');
  const name = text(fd, 'name');
  const id = text(fd, 'id');
  const verticalId = text(fd, 'verticalId');
  const label = text(fd, 'label') || 'it';
  const done = (message: string): FormResult => {
    revalidatePath('/platform/verticals');
    return { ok: true, message };
  };
  switch (intent) {
    case 'approve-vertical': {
      const r = await runTool(ctx, 'review_vertical', { verticalId: id, action: 'approve' });
      return r.ok ? done(`Approved “${label}”.`) : r;
    }
    case 'rename-vertical': {
      const r = await runTool(ctx, 'review_vertical', { verticalId: id, action: 'rename', name });
      return r.ok ? done(`Renamed to “${name.trim()}”.`) : r;
    }
    case 'edit-vertical': {
      const p = payloadOf(fd);
      if (!p) return { ok: false, error: 'Could not read the changes. Try again.' };
      const r = await runTool(ctx, 'update_vertical', { ...p, verticalId: id });
      return r.ok ? done(`Saved “${label}”.`) : r;
    }
    case 'merge-vertical': {
      const p = payloadOf(fd);
      const targetId = text(fd, 'targetId');
      if (!p || !targetId) return { ok: false, error: 'Choose the business type to merge into.' };
      const r = await runTool(ctx, 'merge_vertical', { sourceId: id, targetId, areaMap: p });
      return r.ok ? done(`Merged “${label}”.`) : r;
    }
    case 'approve-area': {
      const r = await runTool(ctx, 'review_business_area', { verticalId, areaId: id, action: 'approve' });
      return r.ok ? done(`Approved “${label}”.`) : r;
    }
    case 'rename-area': {
      const r = await runTool(ctx, 'review_business_area', { verticalId, areaId: id, action: 'rename', name });
      return r.ok ? done(`Renamed to “${name.trim()}”.`) : r;
    }
    case 'merge-area': {
      const targetAreaId = text(fd, 'targetId');
      if (!targetAreaId) return { ok: false, error: 'Choose the service to merge into.' };
      const r = await runTool(ctx, 'merge_business_area', { verticalId, sourceAreaId: id, targetAreaId });
      return r.ok ? done(`Merged “${label}”.`) : r;
    }
    default:
      return { ok: false, error: 'Not found' };
  }
}
