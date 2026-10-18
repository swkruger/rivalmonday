'use server';
import { isAgencyRole, isUuid } from '@cs/core';
import { notFound } from 'next/navigation';
import type { CreateTokenResult, RowResult } from '@/components/ai-connections';
import { createToken, revokeGrant, revokeToken } from '@/server/ai-connections';
import { requireContext } from '@/server/current-viewer';

/** `clientId` only names the page to revalidate; identity and access come from the re-derived context and the tools. */
function pagePath(fd: FormData): string {
  const clientId = String(fd.get('clientId') ?? '');
  if (!isUuid(clientId)) notFound();
  return `/c/${clientId}/settings/ai`;
}

/** Client roles create client-bound tokens here (P10); agency roles create agency-wide ones on /agency/settings/ai. */
export async function createClientTokenAction(_prev: CreateTokenResult, fd: FormData): Promise<CreateTokenResult> {
  const { ctx } = await requireContext();
  if (isAgencyRole(ctx.role)) notFound();
  return createToken(ctx, fd, pagePath(fd));
}

export async function revokeClientTokenAction(_prev: RowResult, fd: FormData): Promise<RowResult> {
  const { ctx } = await requireContext();
  return revokeToken(ctx, fd, pagePath(fd));
}

export async function revokeClientGrantAction(_prev: RowResult, fd: FormData): Promise<RowResult> {
  const { ctx } = await requireContext();
  return revokeGrant(ctx, fd, pagePath(fd));
}
