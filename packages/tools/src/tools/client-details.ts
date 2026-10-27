import { createHash } from 'node:crypto';
import { type AccessContext, canAccessClient, toolkit, ToolError } from '@cs/core';
import { client, clientSetup, contact, type Db } from '@cs/db';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { upsertContact } from '../access/client-invite';
import { ownerContact } from '../setup/owner-contact';
import type { ToolDeps } from '../deps';
import { ClientAddressIn, ClientPhoneIn } from './onboarding';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const OK = z.object({ ok: z.literal(true) });

/** The caller's agency owns the client (not archived) and may see it; anything else is `not_found` (7c1), never a no-op. */
async function requireClientFor(service: Db, ctx: AccessContext, clientId: string): Promise<void> {
  if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
  const [own] = await service.select({ id: client.id }).from(client).where(and(eq(client.id, clientId), eq(client.agencyId, ctx.agencyId), isNull(client.archivedAt)));
  if (!own) throw new ToolError('not_found', 'Client not found');
}

export const getClientDetails = defineTool({
  name: 'get_client_details',
  access: 'read',
  description: 'A client’s business details: name, phone, address, logo, owner contact and where its location came from (agency staff).',
  input: z.object({ clientId: uuid }),
  output: z.object({
    name: z.string(), phone: z.string().nullable(), address: z.object({ line1: z.string(), line2: z.string().optional(), city: z.string(), region: z.string(), postalCode: z.string(), country: z.literal('US') }).nullable(),
    logoUrl: z.string().nullable(), contactName: z.string().nullable(), contactEmail: z.string().nullable(), locationSource: z.enum(['listing', 'geocoded']).nullable(),
  }),
  permission: 'agency',
  supportMask: ['contactEmail'],
  async handler(ctx, { clientId }, deps) {
    await requireClientFor(deps.service, ctx, clientId);
    const [c] = await deps.service.select({ name: client.name, phone: client.phone, address: client.address, logoUrl: client.logoUrl, locationSource: clientSetup.locationSource })
      .from(client).leftJoin(clientSetup, eq(clientSetup.clientId, client.id)).where(eq(client.id, clientId));
    if (!c) throw new ToolError('not_found', 'Client not found');
    const owner = await ownerContact(deps.service, ctx.agencyId, clientId);
    return { name: c.name, phone: c.phone, address: c.address, logoUrl: c.logoUrl, contactName: owner?.name ?? null, contactEmail: owner?.email ?? null, locationSource: c.locationSource };
  },
});

export const updateClientDetails = defineTool({
  name: 'update_client_details',
  access: 'write',
  description: 'Edit a client’s name, phone, address or owner contact; omitted fields stay as they are (agency staff).',
  input: z.object({
    clientId: uuid, name: z.string().trim().min(1).max(200).optional(), phone: ClientPhoneIn.optional(), address: ClientAddressIn.nullable().optional(),
    contactName: z.string().trim().min(1).max(120).optional(), contactEmail: z.string().trim().max(254).email('Enter a valid email address').optional(),
  }),
  output: OK,
  permission: 'agency',
  async handler(ctx, { clientId, contactName, contactEmail, ...patch }, deps) {
    await requireClientFor(deps.service, ctx, clientId);
    const set = {
      ...(patch.name !== undefined ? { name: patch.name } : {}), ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
      ...(patch.address !== undefined ? { address: patch.address } : {}),
    };
    await deps.service.transaction(async (tx) => {
      if (Object.keys(set).length > 0) await tx.update(client).set(set).where(eq(client.id, clientId));
      if (contactName === undefined && contactEmail === undefined) return;
      const owner = await ownerContact(tx, ctx.agencyId, clientId);
      const email = contactEmail?.toLowerCase();
      if (email && email !== owner?.email.toLowerCase()) {
        // A new address becomes (or reuses) the owner contact; the old row stays (it may already receive reports).
        const id = await upsertContact(tx, ctx.agencyId, clientId, email, contactName ?? owner?.name ?? null, 'client_owner');
        // Recency marker: a reused row becomes the newest owner contact (no updated_at column on contact).
        await tx.update(contact).set({ createdAt: new Date(), ...(contactName ? { name: contactName } : {}) }).where(eq(contact.id, id));
      } else if (contactName) {
        if (!owner) throw new ToolError('invalid_input', 'Add the owner email address first');
        await tx.update(contact).set({ name: contactName }).where(eq(contact.id, owner.id));
      }
    });
    return { ok: true as const };
  },
});

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MAX_LOGO_PNG_BYTES = 2 * 1024 * 1024;

export const uploadClientLogo = defineTool({
  name: 'upload_client_logo',
  access: 'write',
  description: 'Store a client’s normalised PNG logo and point the client at it (agency staff).',
  input: z.object({
    clientId: uuid,
    png: z.string().min(1).max(Math.ceil(MAX_LOGO_PNG_BYTES / 3) * 4).regex(/^[A-Za-z0-9+/]+={0,2}$/, 'png must be base64'),
    sha256: z.string().regex(/^[0-9a-f]{64}$/, 'sha256 must be 64 lowercase hex characters'),
  }),
  output: z.object({ logoUrl: z.string() }),
  permission: 'agency',
  async handler(ctx, { clientId, png, sha256 }, deps) {
    await requireClientFor(deps.service, ctx, clientId);
    const store = deps.evidenceStore;
    if (!store) throw new ToolError('internal', 'Logo storage is not configured');
    if (!deps.appUrl) throw new ToolError('internal', 'APP_URL is not configured');
    const bytes = new Uint8Array(Buffer.from(png, 'base64'));
    if (bytes.byteLength > MAX_LOGO_PNG_BYTES || !PNG_SIGNATURE.every((v, i) => bytes[i] === v)) throw new ToolError('invalid_input', 'Logo must be a PNG');
    if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw new ToolError('invalid_input', 'Logo checksum does not match');
    // Content-addressed: an existing object is the same logo, so treat it as stored (store first; a failed update leaves a harmless orphan).
    try {
      await store.put(`logos/clients/${clientId}/${sha256}.png`, bytes, 'image/png');
    } catch (err) {
      if ((err as { code?: string }).code !== 'object_exists') throw err;
    }
    const logoUrl = `${deps.appUrl.replace(/\/+$/, '')}/files/logo/clients/${clientId}/${sha256}.png`;
    await deps.service.update(client).set({ logoUrl }).where(and(eq(client.id, clientId), eq(client.agencyId, ctx.agencyId)));
    return { logoUrl };
  },
});

export const clientDetailsTools = [getClientDetails, updateClientDetails, uploadClientLogo];
