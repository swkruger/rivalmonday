/** The fixed support banner's height: two lines (h-14) below `sm`, one line (h-9) from `sm` up. One source for the banner, its offsets and its spacer. */
export const BANNER_HEIGHT = { base: 'h-14', sm: 'sm:h-9', offset: 'pt-14 sm:pt-9' } as const;

/** Spacer in the flow of split layouts (onboarding) that fill the viewport. */
export const BANNER_SPACER = `${BANNER_HEIGHT.base} shrink-0 ${BANNER_HEIGHT.sm}`;

/**
 * Full-height root that follows a `data-banner-spacer` sibling: the viewport minus the banner, so the page does not scroll
 * by the banner's height. Literal class strings (Tailwind scans them); keep 3.5rem / 2.25rem in step with `BANNER_HEIGHT`.
 */
export const BANNER_FILL = 'min-h-dvh [[data-banner-spacer]+&]:min-h-[calc(100dvh-3.5rem)] sm:[[data-banner-spacer]+&]:min-h-[calc(100dvh-2.25rem)]';
