'use client';

import { ErrorBoundaryPage, type ErrorBoundaryProps } from '@/components/error-boundary-page';

/** Root-level boundary (pages outside the signed-in shells). Shell routes have their own, which keep the sidebar. */
export default function RootError(props: ErrorBoundaryProps) {
  return <ErrorBoundaryPage {...props} />;
}
