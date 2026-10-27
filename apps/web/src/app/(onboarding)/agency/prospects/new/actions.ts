'use server';
import { isAgencyRole } from '@cs/core';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { createClientFromForm } from '@/server/new-client';

/** Same flow as a client (16 §6: prospects follow it without the billing step); the row is made as a prospect. */
export async function createProspectAction(formData: FormData): Promise<FormResult> {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  return createClientFromForm(ctx, formData, 'prospect');
}
