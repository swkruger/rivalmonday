import type { PageCopy } from '.';

/** Short in-page help copy for agency-context pages (`agency.*`, incl. `agency.settings.*`); 15b-2 content tasks fill it. Same rules as `client.ts`. */
export const AGENCY_COPY = {} as const satisfies Record<`agency.${string}`, PageCopy>;
