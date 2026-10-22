'use client';

import { ErrorBoundaryPage } from '@/components/error-boundary-page';

/** In-shell boundary for /platform: renders inside the layout, so the sidebar survives a page crash. */
export default function PlatformError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorBoundaryPage {...props} />;
}
