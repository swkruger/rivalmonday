import { type AgencyOnboardingRow, type EnvName, type OnboardingStep, agencyOnboarding, agencyServiceable, billingNotice, pendingSignup } from '@cs/db';
import { and, eq, isNull, lt, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';

export interface OnboardingJobOptions {
  /** The live environment (`resolveActiveEnvName`); DEMO and TEST send no onboarding tips. */
  envName: EnvName;
  now?: () => Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Tip days, in slot order: slot n (1-3) means tip day `TIP_DAYS[n - 1]`. */
const TIP_DAYS = [1, 3, 7] as const;
const PENDING_RETENTION_DAYS = 30;

/** Count of tip days d in {1, 3, 7} with `createdAt + d days <= now`. */
export function dueTipSlot(createdAt: Date, now: Date): 0 | 1 | 2 | 3 {
  return TIP_DAYS.filter((d) => createdAt.getTime() + d * DAY_MS <= now.getTime()).length as 0 | 1 | 2 | 3;
}

type StepFields = Pick<
  AgencyOnboardingRow,
  'profileDoneAt' | 'profileSkippedAt' | 'teamDoneAt' | 'teamSkippedAt' | 'planDoneAt' | 'planSkippedAt' | 'brandingDoneAt' | 'brandingSkippedAt' | 'firstClientAt'
>;

/**
 * First open wizard step in f6 order (a step is open only when neither done nor skipped, like `get_onboarding_status`),
 * else `first_client` while the agency has no client, else null (nothing left to nudge about).
 */
export function nextOnboardingStep(row: StepFields): OnboardingStep | 'first_client' | null {
  const steps: Array<[OnboardingStep, Date | null, Date | null]> = [
    ['profile', row.profileDoneAt, row.profileSkippedAt],
    ['team', row.teamDoneAt, row.teamSkippedAt],
    ['plan', row.planDoneAt, row.planSkippedAt],
    ['branding', row.brandingDoneAt, row.brandingSkippedAt],
  ];
  for (const [step, done, skipped] of steps) if (!done && !skipped) return step;
  return row.firstClientAt ? null : 'first_client';
}

/**
 * Phase 10 Task 13: daily 15:00 UTC onboarding tips (days 1, 3, 7 after sign-up). One tip per run per agency at most: an
 * agency that missed days 1-6 gets only the day-7 tip. The tip is a `billing_notice` (kind `onboarding_tip`) delivered
 * by `billing-notices`; the guarded `nudges_sent` UPDATE and the enqueue share one transaction so a double run sends once.
 * Also drops OPEN `pending_signup` rows that expired over 30 days ago (completed rows are trial history).
 */
export function createOnboardingJobs(deps: WorkerDeps, opts: OnboardingJobOptions) {
  const nudges = defineJob({
    name: 'onboarding-nudges',
    schema: z.looseObject({}),
    cron: '0 15 * * *',
    queue: { expireInSeconds: 3600 },
    handler: async () => {
      if (opts.envName === 'demo' || opts.envName === 'test') {
        console.log(`[onboarding-nudges] skipped in ${opts.envName}`);
        return { skipped: opts.envName };
      }
      const db = deps.serviceDb();
      const now = opts.now?.() ?? new Date();
      const rows = await db
        .select()
        .from(agencyOnboarding)
        .where(
          and(
            isNull(agencyOnboarding.completedAt),
            isNull(agencyOnboarding.dismissedAt),
            isNull(agencyOnboarding.unsubscribedAt),
            ne(agencyOnboarding.source, 'legacy'),
            agencyServiceable(agencyOnboarding.agencyId),
          ),
        );
      let sent = 0;
      let failed = 0;
      let cleaned = 0;
      try {
        for (const row of rows) {
          const slot = dueTipSlot(row.createdAt, now);
          const nextStep = nextOnboardingStep(row);
          if (slot <= row.nudgesSent || !nextStep) continue;
          const day = TIP_DAYS[slot - 1]!;
          try {
            const won = await db.transaction(async (tx) => {
              const upd = await tx
                .update(agencyOnboarding)
                .set({ nudgesSent: slot })
                .where(and(eq(agencyOnboarding.agencyId, row.agencyId), lt(agencyOnboarding.nudgesSent, slot)))
                .returning({ agencyId: agencyOnboarding.agencyId });
              if (upd.length === 0) return false; // another run won
              await tx
                .insert(billingNotice)
                .values({ agencyId: row.agencyId, kind: 'onboarding_tip', audience: 'agency', dedupeKey: `onboarding_tip:${row.agencyId}:${day}`, params: { day, nextStep }, createdAt: now })
                .onConflictDoNothing({ target: billingNotice.dedupeKey });
              return true;
            });
            if (won) sent++;
          } catch (err) {
            // One agency's failure must not stop the others; log the id and error name only.
            failed++;
            console.error(`[onboarding-nudges] tip failed for agency ${row.agencyId}: ${err instanceof Error ? err.name : 'unknown'}`);
          }
        }
      } finally {
        // Completed rows are kept forever: `trialAllowed` reads them ("one trial per email ever"). Only open rows expire.
        const cutoff = new Date(now.getTime() - PENDING_RETENTION_DAYS * DAY_MS);
        const gone = await db
          .delete(pendingSignup)
          .where(and(isNull(pendingSignup.completedAt), lt(pendingSignup.expiresAt, cutoff)))
          .returning({ id: pendingSignup.id });
        cleaned = gone.length;
      }
      const out = { sent, failed, cleaned };
      console.log(`[onboarding-nudges] ${JSON.stringify(out)}`);
      return out;
    },
  });
  return { nudges };
}
