/** Error reporting seam. Phase 7 replaces the body with Sentry; the signature is frozen. */
export function reportError(error: Error & { digest?: string }, where: 'page' | 'global'): void {
  console.error('[app-error]', where, error.digest ?? '', error);
}
