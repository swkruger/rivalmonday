import * as Sentry from '@sentry/nextjs';
import type { AccessContext } from '@cs/core';
import { headers } from 'next/headers';
import { requestIdFrom } from './request-id';

/** Tag the current request's Sentry scope with ids only (agency, client, request). A no-op without Sentry; never throws. */
export async function tagRequest(ctx: AccessContext, input: unknown): Promise<void> {
  try {
    const fromInput = input && typeof input === 'object' ? (input as { clientId?: unknown }).clientId : undefined;
    const clientId = typeof fromInput === 'string' ? fromInput : Array.isArray(ctx.clientScope) && ctx.clientScope.length === 1 ? ctx.clientScope[0] : undefined;
    const tags: Record<string, string> = {};
    if (ctx.agencyId) tags.agencyId = ctx.agencyId;
    if (clientId) tags.clientId = clientId;
    tags.requestId = requestIdFrom(await headers());
    Sentry.getIsolationScope().setTags(tags);
  } catch {
    // outside a request (scripts, tests) or Sentry not initialised
  }
}
