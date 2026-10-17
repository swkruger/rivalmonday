import { MAPS_SEARCH_OPERATION } from '@cs/collectors';
import { toolkit, ToolError } from '@cs/core';
import { setupLookupSchema, vendorCall } from '@cs/db';
import { listVerticalPacks } from '@cs/verticals';
import { and, count, eq, gte, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { packsOf, type ToolDeps } from '../deps';
import { FIND_BUSINESS_DAILY_CAP, preselectVertical, toSetupLookup } from '../setup/lookup';

const { defineTool } = toolkit<ToolDeps>();

const FoundPlace = setupLookupSchema.extend({ suggestedVerticalId: z.string().nullable() });

export const findBusiness = defineTool({
  name: 'find_business',
  access: 'read',
  description: 'Look up a business on Google Maps by name and city/ZIP (agency staff, new-client wizard). Limited to 30 searches per agency per day.',
  input: z.object({ name: z.string().trim().min(1).max(120), location: z.string().trim().min(2).max(120) }),
  output: z.object({ places: z.array(FoundPlace).max(5) }),
  permission: 'agency',
  channels: ['web'],
  async handler(ctx, input, deps) {
    if (ctx.clientScope !== 'all') throw new ToolError('permission_denied', 'Only agency-wide staff can look up businesses');
    if (ctx.support) throw new ToolError('permission_denied', 'Not available in a support session');
    if (!deps.setupLookup) throw new ToolError('internal', 'Business search is not configured', { userFacing: true });

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const [{ n } = { n: 0 }] = await deps.service
      .select({ n: count() })
      .from(vendorCall)
      .where(and(eq(vendorCall.vendor, 'dataforseo'), eq(vendorCall.operation, MAPS_SEARCH_OPERATION), eq(vendorCall.agencyId, ctx.agencyId), isNull(vendorCall.clientId), gte(vendorCall.createdAt, startOfDay)));
    if (n >= FIND_BUSINESS_DAILY_CAP) {
      throw new ToolError('rate_limited', `You've reached today's limit of ${FIND_BUSINESS_DAILY_CAP} business searches. Try again tomorrow or enter the details by hand.`, { userFacing: true });
    }

    const found = await deps.setupLookup({ keyword: `${input.name} ${input.location}`, locationName: 'United States' }, { agencyId: ctx.agencyId, clientId: null });
    const usable = found.filter((p) => !p.closed).flatMap((p) => {
      const lookup = toSetupLookup(p);
      return lookup ? [{ lookup, categories: [p.category, ...(p.additionalCategories ?? [])].filter((c): c is string => !!c) }] : [];
    }).slice(0, 5);
    const packs = usable.length ? await Promise.all((await listVerticalPacks()).map((id) => packsOf(deps)(id))) : [];
    return { places: usable.map(({ lookup, categories }) => ({ ...lookup, suggestedVerticalId: preselectVertical(packs, categories) })) };
  },
});

export const setupTools = [findBusiness];
