'use client';

import { ErrorBoundaryPage } from '@/components/error-boundary-page';

/** In-shell boundary: renders inside the layout, so the sidebar survives a page crash. */
export default function AppError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorBoundaryPage {...props} />;
}
