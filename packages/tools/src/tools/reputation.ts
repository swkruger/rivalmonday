import { toolkit } from '@cs/core';
import { reviewBenchmark, themesForVertical } from '@cs/engine';
import { z } from 'zod';
import { packsOf, type ToolDeps } from '../deps';
import { workspaceClient } from '../workspace/scope';
import { ThemeBenchmarkView } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();

export const getThemeBenchmark = defineTool({
  name: 'get_theme_benchmark',
  description: 'Review themes, your business vs each tracked competitor: how often each theme comes up and how positively, last 90 days vs the 90 before.',
  input: z.object({ clientId: uuid }),
  output: ThemeBenchmarkView,
  permission: 'read',
  feature: 'dashboard',
  async handler(ctx, { clientId }, deps) {
    const c = await workspaceClient(deps, ctx, clientId);
    const packs = packsOf(deps);
    // reviewBenchmark/themesForVertical read client_competitor, review, review_analysis and theme_proposal with the service
    // Db — the client was proved through RLS above, and they only reach its tracked competitors and its self business.
    const b = await reviewBenchmark({ db: deps.service, packs }, c.id);
    const themes = await themesForVertical(deps.service, await packs(c.verticalId));
    return {
      windowDays: b.windowDays, from: b.from.toISOString(), to: b.to.toISOString(),
      themes: themes.map((t) => ({ id: t.id, name: t.name })),
      businesses: b.businesses.map((x) => ({
        competitorId: x.competitorId, name: x.name, self: x.self, reviews: x.reviews, avgRating: x.avgRating, prevReviews: x.prevReviews, prevAvgRating: x.prevAvgRating,
        themes: x.themes.map((t) => ({ themeId: t.themeId, mentions: t.mentions, asked: t.asked, share: t.share, sentiment: t.sentiment, shareDelta: t.shareDelta, sentimentDelta: t.sentimentDelta })),
      })),
    };
  },
});

export const reputationTools = [getThemeBenchmark];
