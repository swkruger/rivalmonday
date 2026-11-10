import { toolkit } from '@cs/core';
import { citationAuditRun, citationListing, client, clientCompetitor, evidence, withTenant } from '@cs/db';
import { citationCatalogue } from '@cs/verticals';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { z } from 'zod';
import { packsOf } from '../catalog/access';
import type { ToolDeps } from '../deps';
import { citableEvidenceKinds } from '../workspace/events-read';
import { forChannel } from '../workspace/model-text';
import { trackedRows, workspaceBusinesses } from '../workspace/business';
import { allInOrder, workspaceClient } from '../workspace/scope';
import { CitationAuditView } from './schemas';

const { defineTool } = toolkit<ToolDeps>();

export const getCitationAudit = defineTool({
  name: 'get_citation_audit',
  access: 'read',
  description: "Whether the client and its top rivals are listed on the major online directories in Google search, from the latest monthly check: per directory a listing status (listed, not found or not checked), "
    + 'whether the name and phone match, and the link. alsoFoundOn lists the client\'s own listings on other directories. Each listing\'s evidenceId is the evidence to cite for it. Empty before the first check.',
  input: z.object({ clientId: z.string().uuid() }),
  output: CitationAuditView,
  permission: 'read',
  channels: ['web', 'mcp', 'ask'],
  feature: 'dashboard',
  async handler(ctx, input, deps, meta) {
    const clientId = input.clientId;
    // Client check and tenant reads start together. Listings are global rows admitted by RLS (`app_competitor_visible`); they are
    // narrowed to this client's tracked rivals and own business, then to the audited businesses below.
    const [c, [tracked, [latest], [good], rows]] = await allInOrder([
      workspaceClient(deps, ctx, clientId),
      withTenant(deps.app, ctx, (tx) => Promise.all([
        trackedRows(tx, clientId),
        tx.select({ status: citationAuditRun.status, competitorIds: citationAuditRun.competitorIds }).from(citationAuditRun)
          .where(eq(citationAuditRun.clientId, clientId)).orderBy(desc(citationAuditRun.startedAt), desc(citationAuditRun.id)).limit(1),
        tx.select({ status: citationAuditRun.status, finishedAt: citationAuditRun.finishedAt }).from(citationAuditRun)
          .where(and(eq(citationAuditRun.clientId, clientId), inArray(citationAuditRun.status, ['done', 'capped']))).orderBy(desc(citationAuditRun.finishedAt), desc(citationAuditRun.id)).limit(1),
        tx.select().from(citationListing).where(or(
          inArray(citationListing.competitorId, tx.select({ id: clientCompetitor.competitorId }).from(clientCompetitor).where(eq(clientCompetitor.clientId, clientId))),
          inArray(citationListing.competitorId, tx.select({ id: client.selfCompetitorId }).from(client).where(eq(client.id, clientId))),
        )),
      ])),
    ]);
    const directories = citationCatalogue(await packsOf(deps)(c.verticalId)).map((d) => ({ host: d.host, label: d.label, addListingUrl: d.add_listing_url }));
    const hosts = new Set(directories.map((d) => d.host));

    // Self (when it has a competitor row) first, then the latest run's rivals that are still tracked, in the run's order.
    const list = await workspaceBusinesses(deps, ctx, c, tracked);
    const self = c.selfCompetitorId ? list.find((b) => b.self && b.competitorId === c.selfCompetitorId) : undefined;
    const trackedById = new Map(list.filter((b) => !b.self).map((b) => [b.competitorId, b]));
    const rivals = (latest?.competitorIds ?? []).filter((id) => id !== c.selfCompetitorId).flatMap((id) => trackedById.get(id) ?? []);
    const businesses = [...(self ? [self] : []), ...rivals];

    // Evidence of the shown rows, read beside nothing else (the rows were proved visible above; `evidence` is a global table).
    const alsoRows = c.selfCompetitorId
      ? rows.filter((r) => r.competitorId === c.selfCompetitorId && !r.inCatalogue && r.status === 'listed' && !hosts.has(r.host) && r.listingUrl)
      : [];
    const shown = [...rows.filter((r) => hosts.has(r.host) && businesses.some((b) => b.competitorId === r.competitorId)), ...alsoRows];
    const captureIds = [...new Set(shown.map((r) => r.captureId).filter((x): x is string => x !== null))];
    const evRows = captureIds.length
      ? await deps.service.select({ id: evidence.id, captureId: evidence.captureId }).from(evidence)
        .where(and(inArray(evidence.captureId, captureIds), inArray(evidence.kind, citableEvidenceKinds(meta)))).orderBy(evidence.kind, evidence.id)
      : [];
    const evidenceOf = (captureId: string | null) => (captureId ? evRows.find((e) => e.captureId === captureId)?.id ?? null : null);

    const names = list.map((b) => b.name);
    const status: CitationAuditView['status'] = !latest ? 'never' : latest.status === 'failed' ? (good?.status === 'done' || good?.status === 'capped' ? good.status : 'never') : latest.status;
    return {
      checkedAt: good?.finishedAt?.toISOString() ?? null,
      status,
      directories,
      businesses: businesses.map((b) => ({
        competitorId: b.competitorId!,
        name: forChannel(meta, b.name, names),
        self: b.self,
        listings: directories.map((d) => {
          const r = rows.find((x) => x.competitorId === b.competitorId && x.host === d.host);
          if (!r) return { host: d.host, status: 'not_checked' as const, nameMatch: null, phoneMatch: null, listingUrl: null, shownPhone: null, evidenceId: null, checkedAt: null };
          return {
            host: d.host, status: r.status, nameMatch: r.nameMatch, phoneMatch: r.phoneMatch, listingUrl: r.listingUrl, shownPhone: r.shownPhone,
            evidenceId: evidenceOf(r.captureId), checkedAt: r.checkedAt.toISOString(),
          };
        }),
      })),
      selfMissing: !c.selfCompetitorId,
      alsoFoundOn: alsoRows.map((r) => ({ host: r.host, listingUrl: r.listingUrl!, evidenceId: evidenceOf(r.captureId) })).sort((a, b) => a.host.localeCompare(b.host, 'en')),
    };
  },
});

export const citationTools = [getCitationAudit];
