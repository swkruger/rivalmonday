'use client';

import { ErrorBoundaryPage } from '@/components/error-boundary-page';

/** Root-level boundary (pages outside the signed-in shells). Shell routes have their own, which keep the sidebar. */
export default function RootError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorBoundaryPage {...props} />;
}
