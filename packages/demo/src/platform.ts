import { capture, decisionReview, detectedChange, themeProposal } from '@cs/db';
import { DAY } from './clock';
import type { SeedContext } from './context';
import { DEMO_COLLECTOR } from './tenancy';

/** Deviation 1: one pending proposal per vertical (theme_proposal_pending_unique), plus two recent decisions. */
async function seedThemeProposals(ctx: SeedContext): Promise<void> {
  const { db, ids, clock } = ctx;
  const samples = ids.sampleReviewIds;
  await db.insert(themeProposal).values([
    { verticalId: 'hvac_plumbing', themeId: 'warranty_handling', name: 'Warranty handling', description: 'How the company honours parts and labour warranties', status: 'proposed', otherCount: 14, sampleReviewIds: samples, createdAt: clock.daysAgo(3) },
    { verticalId: 'dental', themeId: 'parking_access', name: 'Parking & access', description: 'Parking, step-free access and finding the office', status: 'proposed', otherCount: 9, sampleReviewIds: [], createdAt: clock.daysAgo(4) },
    { verticalId: 'hvac_plumbing', themeId: 'financing_clarity', name: 'Financing clarity', description: 'Clear terms on financing offers', status: 'approved', otherCount: 11, sampleReviewIds: [], createdAt: clock.daysAgo(9), decidedAt: clock.daysAgo(5), decidedBy: ids.users.operator.userId },
    { verticalId: 'hvac_plumbing', themeId: 'noise_level', name: 'Noise level', description: 'Noise of new equipment after install', status: 'rejected', otherCount: 6, sampleReviewIds: [], createdAt: clock.daysAgo(15), decidedAt: clock.daysAgo(12), decidedBy: ids.users.operator.userId },
  ]);
}

const PENDING_CHANGES = [
  { before: 'Now hiring: none', after: 'Now hiring HVAC technicians, $2,000 sign-on bonus', type: 'hiring' },
  { before: 'Spring maintenance from $99', after: 'Spring maintenance from $99. Members save 15%.', type: 'promo' },
  { before: 'Serving Granbury and Acton', after: 'Serving Granbury, Acton and Stephenville', type: 'service_area_change' },
  { before: 'Our team', after: 'Meet our new service manager', type: 'content' },
] as const;

/** Spec §4.8: 4 low-confidence web changes waiting for an operator (5b-2 platform queue). */
async function seedDecisionReviews(ctx: SeedContext): Promise<void> {
  const { db, ids, clock } = ctx;
  for (const [i, p] of PENDING_CHANGES.entries()) {
    const comp = ids.competitors.loneStar[i]!;
    const pageId = ids.pages[comp.id]!.home;
    const at = clock.daysAgo(i + 1.5);
    const base = { competitorId: comp.id, trackedPageId: pageId, source: 'web', url: `https://${comp.domain}/`, status: 'ok', httpStatus: 200, collectorVersion: DEMO_COLLECTOR };
    const [before, after] = await db.insert(capture).values([{ ...base, capturedAt: new Date(at.getTime() - DAY) }, { ...base, capturedAt: at }]).returning({ id: capture.id });
    const [ch] = await db.insert(detectedChange).values({
      competitorId: comp.id, trackedPageId: pageId, source: 'web', kind: 'modified', beforeCaptureId: before!.id, afterCaptureId: after!.id, blockKey: `demo-review-${i}`,
      beforeText: p.before, afterText: p.after, similarity: 0.71, status: 'pending', stageVersion: 1, detectedAt: at,
    }).returning({ id: detectedChange.id });
    await db.insert(decisionReview).values({
      subjectType: 'detected_change', subjectId: ch!.id, keys: ['meaningful', 'change_type'],
      answers: { meaningful: { value: true, confidence: 0.58 }, change_type: { value: p.type, confidence: 0.51 } }, createdAt: at,
    });
  }
}

/** Spec §4.8 platform queues. */
export async function seedPlatform(ctx: SeedContext): Promise<void> {
  await seedThemeProposals(ctx);
  await seedDecisionReviews(ctx);
}
