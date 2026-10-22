'use client';

import { ErrorBoundaryPage, type ErrorBoundaryProps } from '@/components/error-boundary-page';

/** In-shell boundary: renders inside the layout, so the sidebar survives a page crash. */
export default function AppError(props: ErrorBoundaryProps) {
  return <ErrorBoundaryPage {...props} />;
}
