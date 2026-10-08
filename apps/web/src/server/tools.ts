import 'server-only';
import { type AccessContext, ToolError, type ToolRegistry } from '@cs/core';
import { deliveryConfigFromEnv } from '@cs/engine';
import { createToolRegistry, type ToolDeps } from '@cs/tools';
import { notFound } from 'next/navigation';
import { dbs } from './db';
import { webEnv } from './env';
import { enqueueJob, jobStatus } from './queue';

let cached: ToolRegistry<ToolDeps> | null = null;
export const registry = () =>
  (cached ??= createToolRegistry({ ...dbs(), delivery: deliveryConfigFromEnv(process.env), enqueue: enqueueJob, jobStatus, webMonitoring: webEnv().webMonitoring, platformAdmins: webEnv().platformAdmins }));

/**
 * Controller requirement: `permission_denied` and `not_found` must become a 404, never a 403 or a page that
 * distinguishes "exists but not yours" from "does not exist" (spec §11, no cross-tenant existence leaks).
 * `invalid_input` is hidden too — a malformed id (e.g. from a tampered URL segment) must not surface differently
 * from a real id that does not resolve for this viewer. Every other code (rate_limited, quota_exceeded, internal)
 * propagates to the route's error boundary.
 */
export function isHiddenToolError(e: unknown): boolean {
  return e instanceof ToolError && (e.code === 'not_found' || e.code === 'permission_denied' || e.code === 'invalid_input');
}

export async function callTool<T>(ctx: AccessContext, name: string, input: unknown): Promise<T> {
  try {
    return (await registry().invoke(ctx, name, input)) as T;
  } catch (e) {
    if (isHiddenToolError(e)) notFound();
    throw e;
  }
}

/**
 * For a page's *selected* item whose id comes from the URL (`?event=`, `?move=`): a stale, retracted, foreign or
 * malformed id gives `null` — all alike, so nothing leaks about other tenants — and the page shows "no longer
 * available" instead of a 404. Page-level gates (client access, flags) must still use `callTool`.
 */
export function createTryCallTool(reg: () => Pick<ToolRegistry<ToolDeps>, 'invoke'>) {
  return async function tryCallTool<T>(ctx: AccessContext, name: string, input: unknown): Promise<T | null> {
    try {
      return (await reg().invoke(ctx, name, input)) as T;
    } catch (e) {
      if (isHiddenToolError(e)) return null;
      throw e;
    }
  };
}

export const tryCallTool = createTryCallTool(registry);
