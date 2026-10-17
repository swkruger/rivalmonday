import type { SetupLookup, SetupSuggestions } from '@cs/db';
import type { ClientSafeSuggestion, SetupState } from '@cs/tools';

/** The output of the `get_client_setup` tool (Phase 11a Task 7), as the wizard reads it. */
export interface ClientSetupView {
  state: SetupState;
  lookup: SetupLookup | null;
  suggestions: SetupSuggestions;
  search: {
    status: 'queued' | 'searching' | 'checking' | 'finalising' | 'done' | 'failed';
    progress: { searchesDone: number; searchesTotal: number; checksDone: number; checksTotal: number };
    kept: number | null;
    finishedAt: string | null;
  } | null;
  competitorSuggestions: ClientSafeSuggestion[];
  vertical: { services: { id: string; name: string }[]; seedKeywords: string[] };
}

export type { ClientSafeSuggestion };

/** What a wizard write action hands back to the always-mounted wizard (which keeps the message across revalidation). */
export type SetupActionResult = { ok: true; searchRefusal: string | null } | { ok: false; error: string };
