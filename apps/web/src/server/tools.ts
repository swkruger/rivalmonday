import 'server-only';
import { type AccessContext, ToolError, type ToolRegistry } from '@cs/core';
import { deliveryConfigFromEnv } from '@cs/engine';
import { createToolRegistry, type ToolDeps } from '@cs/tools';
import { notFound } from 'next/navigation';
import { dbs } from './db';
import { webEnv } from './env';
import { enqueueJob } from './queue';

let cached: ToolRegistry<ToolDeps> | null = null;
export const registry = () =>
  (cached ??= createToolRegistry({ ...dbs(), delivery: deliveryConfigFromEnv(process.env), enqueue: enqueueJob, webMonitoring: webEnv().webMonitoring }));

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
