import type { PageCopy } from '.';

/** Short in-page help copy for platform-context pages (`platform.*`); 15b-2 content tasks fill it. Same rules as `client.ts`. */
export const PLATFORM_COPY = {} as const satisfies Record<`platform.${string}`, PageCopy>;
