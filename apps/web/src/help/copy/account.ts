import type { PageCopy } from '.';

/** Short in-page help copy for account pages (`account.*`) shown in every context; 15b-2 content tasks fill it. Same rules as `client.ts`. */
export const ACCOUNT_COPY = {} as const satisfies Record<`account.${string}`, PageCopy>;
