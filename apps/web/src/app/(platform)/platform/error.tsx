'use client';

import { ErrorBoundaryPage, type ErrorBoundaryProps } from '@/components/error-boundary-page';

/** In-shell boundary for /platform: renders inside the layout, so the sidebar survives a page crash. */
export default function PlatformError(props: ErrorBoundaryProps) {
  return <ErrorBoundaryPage {...props} />;
}
