'use server';
import { type AccessContext, isAgencyRole } from '@cs/core';
import { notFound } from 'next/navigation';
import type { CreateTokenResult, RowResult } from '@/components/ai-connections';
import { createToken, revokeGrant, revokeToken } from '@/server/ai-connections';
import { requireContext } from '@/server/current-viewer';

const PATH = '/agency/settings/ai';

async function agencyCtx(): Promise<AccessContext> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  return ctx;
}

export async function createAgencyTokenAction(_prev: CreateTokenResult, fd: FormData): Promise<CreateTokenResult> {
  return createToken(await agencyCtx(), fd, PATH);
}

export async function revokeAgencyTokenAction(_prev: RowResult, fd: FormData): Promise<RowResult> {
  return revokeToken(await agencyCtx(), fd, PATH);
}

export async function revokeAgencyGrantAction(_prev: RowResult, fd: FormData): Promise<RowResult> {
  return revokeGrant(await agencyCtx(), fd, PATH);
}
