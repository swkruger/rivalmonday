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
  /** Phase 11b: the invited owner. Name and email are null for client roles. */
  invite: { status: 'none' | 'pending' | 'accepted'; name: string | null; email: string | null };
  vertical: { name: string; services: { id: string; name: string }[]; seedKeywords: string[] };
}

export type { ClientSafeSuggestion };

/** What a wizard write action hands back to the always-mounted wizard (which keeps the message across revalidation). */
export type SetupActionResult = { ok: true; searchRefusal: string | null } | { ok: false; error: string };

/** `get_client_details` (agency staff): the step 1 facts the later screens and the confirmation read back. */
export interface ClientDetailsView {
  name: string;
  phone: string | null;
  address: { line1: string; line2?: string; city: string; region: string; postalCode: string; country: 'US' } | null;
  logoUrl: string | null;
  contactName: string | null;
  contactEmail: string | null;
  locationSource: 'listing' | 'geocoded' | null;
}

/** What the area step starts from: the client's saved profile (services as business-area ids). */
export interface ProfileInitial {
  services: string[];
  keywords: string[];
  placeId: string | null;
  serviceArea: { center: { lat: number; lng: number }; radiusKm: number; zips: string[]; towns?: string[] } | null;
}
