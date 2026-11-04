/** The fixed support banner's height: two lines (h-14) below `sm`, one line (h-9) from `sm` up. One source for the banner, its offsets and its spacer. */
export const BANNER_HEIGHT = { base: 'h-14', sm: 'sm:h-9', offset: 'pt-14 sm:pt-9' } as const;

/** Spacer in the flow of split layouts (onboarding) that fill the viewport. */
export const BANNER_SPACER = `${BANNER_HEIGHT.base} shrink-0 ${BANNER_HEIGHT.sm}`;

/**
 * Full-height root that follows a `data-banner-spacer` sibling: the viewport minus the banner, so the page does not scroll
 * by the banner's height. Literal class strings (Tailwind scans them); keep 3.5rem / 2.25rem in step with `BANNER_HEIGHT`.
 */
export const BANNER_FILL = 'min-h-dvh [[data-banner-spacer]+&]:min-h-[calc(100dvh-3.5rem)] sm:[[data-banner-spacer]+&]:min-h-[calc(100dvh-2.25rem)]';

/**
 * The shell's sticky offsets (2026-11-03, owner: full-width sticky top bar). `--rm-banner-h` is the fixed support banner's
 * height (0 without one): the sticky top bar sits there. `--rm-shell-top` (banner + the 48px bar) is where the sticky
 * sidebar starts; sticky page content uses `top-[calc(var(--rm-shell-top,0px)+…)]` so it never slides under the bar.
 * Literal class strings (Tailwind scans them); keep 3.5rem / 2.25rem in step with `BANNER_HEIGHT`.
 */
export const SHELL_OFFSET = {
  plain: '[--rm-banner-h:0px] [--rm-shell-top:3rem]',
  support: '[--rm-banner-h:3.5rem] [--rm-shell-top:6.5rem] sm:[--rm-banner-h:2.25rem] sm:[--rm-shell-top:5.25rem]',
} as const;
