/**
 * Hooks the dev panel installs when it loads (Task 18). Empty in every other process, including production,
 * where the panel module is never imported.
 */
export const devHooks: { onMagicLink?: (email: string, url: string) => void } = {};
