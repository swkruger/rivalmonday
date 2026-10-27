import 'server-only';
import { type AccessContext } from '@cs/core';
import { setupLookupSchema } from '@cs/db';
import { redirect } from 'next/navigation';
import type { FormResult } from './forms';
import { LOGO_ERROR_COPY, normalizeLogo } from './logo';
import { runTool } from './run-tool';

const text = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

/**
 * The end of steps 1-2 of the client (and prospect) flow (16 P4): the client row is made here, with the step 1 details,
 * the picked listing (when there is one) and the typed "City or ZIP" (geocoded server-side when there is no listing and
 * no address). A logo is normalised first, so a bad file stops before anything is created; it is stored once the client
 * exists, and a failed store does not undo the client (the logo can be added later). Returns only on a refusal.
 */
export async function createClientFromForm(ctx: AccessContext, fd: FormData, status: 'active' | 'prospect'): Promise<FormResult> {
  const rawLookup = text(fd, 'lookup');
  let lookup: ReturnType<typeof setupLookupSchema.parse> | undefined;
  if (rawLookup) {
    let raw: unknown;
    try {
      raw = JSON.parse(rawLookup);
    } catch {
      raw = null;
    }
    const parsed = setupLookupSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: 'Choose a business from the results first.' };
    lookup = parsed.data;
  }

  let logo: { png: Uint8Array; sha256: string } | null = null;
  const file = fd.get('logo');
  if (file instanceof Blob && file.size > 0) {
    const n = await normalizeLogo(new Uint8Array(await file.arrayBuffer()), file.type);
    if ('error' in n) return { ok: false, error: LOGO_ERROR_COPY[n.error] };
    logo = n;
  }

  const a = { line1: text(fd, 'line1'), line2: text(fd, 'line2'), city: text(fd, 'city'), region: text(fd, 'region'), postalCode: text(fd, 'postalCode') };
  const address = Object.values(a).every((v) => !v) ? null : { line1: a.line1, ...(a.line2 ? { line2: a.line2 } : {}), city: a.city, region: a.region, postalCode: a.postalCode, country: 'US' };
  const locality = text(fd, 'locality');
  const r = await runTool<{ clientId: string }>(ctx, 'create_client', {
    name: text(fd, 'name'), verticalId: text(fd, 'verticalId'), services: [], keywords: [], serviceArea: null, placeId: null,
    ...(lookup ? { lookup } : {}),
    details: { phone: text(fd, 'phone'), ...(address ? { address } : {}), ...(locality ? { locality } : {}), contact: { name: text(fd, 'contactName'), email: text(fd, 'email') } },
    ...(status === 'prospect' ? { status } : {}),
  });
  if (!r.ok) return r;
  if (logo) {
    const up = await runTool(ctx, 'upload_client_logo', { clientId: r.data.clientId, png: Buffer.from(logo.png).toString('base64'), sha256: logo.sha256 });
    if (!up.ok) console.warn(`[new-client] logo for ${r.data.clientId} was not stored: ${up.error}`);
  }
  redirect(`/c/${r.data.clientId}/setup`);
}
