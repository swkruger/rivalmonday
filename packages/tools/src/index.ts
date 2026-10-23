export { queueCompetitorReview } from './setup/review-email';
export { completeIfDone, deriveSetupState, getSetupState, type SetupState, type SetupStateInput, type StepStatus } from './setup/state';
export * from './access/invitations';
export * from './access/signup';
export * from './access/signup-complete';
export * from './access/free-mail';
export * from './ask-tools';
export * from './access/memberships';
export * from './access/plan-features';
export * from './access/oauth';
export * from './access/team';
export { sendTeamInviteEmail } from './access/team-invite-email';
export * from './access/unsubscribe';
export { assertAgencyServiceable, pausedMessage } from './billing-guard';
export * from './client-input';
export * from './deps';
export * from './inbox';
export * from './limits';
export * from './platform';
export * from './preferences';
export * from './pressure';
export * from './registry';
export * from './settings';
export * from './timezone';
export * from './usage';
// Workspace internals (scope, evidence access, ad series, event reads) are DB-touching and stay private: apps read
// through the registry. Only the pure helpers below are public.
export { EVIDENCE_CONTENT_TYPES, evidenceContentType, type ServableEvidenceKind } from './workspace/evidence-access';
export * from './workspace/labels';
export * from './workspace/word-diff';
// 15a: the web's numbered pages (Briefs & reports) ask a paged list tool for page n.
export { encodeCursor } from './paging';
export * from './tools/schemas';
export { clientOwnerEmails } from './tools/client-billing';
export { assertRoomForCompetitors, type Discovery, lockClientLimit, startDiscovery } from './tools/competitors';
export { latestDoneRun, listMonthlyRivalClients, manualSearchWeek, nextManualSearchAt, type SearchRefusal, type SearchStart, type SearchTrigger, searchDayLabel, searchDayLabelAt, startCompetitorSearch } from './rival-search';
// Shared by the `fetch` tool and the MCP `evidence://` / `brief://` resources (@cs/mcp); every refusal is `not_found`.
export { type FetchOutput, fetchItem, ITEM_TYPES, type ItemType, parseItemId } from './search/fetch-item';
export type { AskActionView, AskMessageView, AskThreadSummary, AskThreadView } from './tools/ask-threads';
// Phase 6c: the worker's kb-import / kb-sync jobs save and rechunk through the same service-connection writer as the tools.
export { type ArticleInput, rechunk, saveArticle } from './kb/write';
export { parseSeedFile, seedKnowledge } from './kb/seed';
export { blocksToMarkdown, type MarkdownBlock } from './kb/blocks-to-markdown';
export { IMPORT_ERRORS, type ImportError } from './kb/import-error';
export { isPublicAddress, isPublicHttpUrl } from '@cs/collectors';
// Phase 8b: read-only platform support sessions.
export {
  endOpenSessionFor, endSession, type OpenSupportSession, resolveSession, type ResolveResult, startSession, SUPPORT_SESSION_MINUTES,
} from './platform/support';
export { supportDisplayName } from './tools/support';
// Phase 8a P2: nightly agency_daily_stat computation, shared by the worker job and the demo seed.
export {
  addDays, type AgencyDailyStatInsert, BACKFILL_MAX_DAYS, computeAgencyDay, detectStatSources, runDailyStats, type RunDailyStatsOpts,
  type StatSources, upsertDailyStats, utcDay,
} from './platform/stats';
// Phase 8c: platform hosting costs (daily snapshot job, low-balance alerts).
export { ADAPTERS as COST_ADAPTERS, evaluateAlerts as evaluateCostAlerts, platformOperatorEmails, platformOwnerEmails, type PlatformCostLowPayload, snapshotAll as snapshotPlatformCosts, type SnapshotDeps as PlatformCostSnapshotDeps, SERVICES as COST_SERVICES, type CostEnv, type ServiceKey as CostServiceKey } from './platform/costs';
export type { ClientSafeSuggestion } from './tools/setup';
export { FIND_BUSINESS_DAILY_CAP, preselectVertical, toSetupLookup } from './setup/lookup';
export { buildSuggestionSource, detectNewAreas, gbpServiceNames, setupSuggestionsJsonSchema, type SuggestionSource, validateSuggestions } from './setup/suggestions';
// Phase 11c: public intake service functions (no session; called by the /start server actions).
export { getPublicPreview, type IntakeBranding, type IntakePlaceOption, intakeLookup, type PublicAgencyBranding, resolveIntake, submitIntake, verifyIntake } from './intake/public';
export { INTAKE_SIG_TTL_MS, intakeLookupSchema, type SignedIntakePlace, signedIntakePlaceSchema } from './intake/signed';
export { buildSnapshot, LEAD_SUMMARY_SYSTEM, leadSummaryJsonSchema, snapshotFacts, validateSummary } from './intake/preview';
export { type LeadEmailDeps, type LeadEmailKind, sendLeadEmail } from './intake/emails';
export { catalogOf, catalogPacks } from './catalog/access';
export { platformHealthOutput, type PlatformHealth } from './platform/system-health';
export { recordSupportAccess, type SupportAccessSurface } from './platform/audit';
