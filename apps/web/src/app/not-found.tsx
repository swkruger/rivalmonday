import type { Metadata } from 'next';
import { ErrorPanel } from '@/components/error-panel';

// Neutral: no product or agency suffix (the root title template must not apply).
export const metadata: Metadata = { title: { absolute: 'Page not found' } };

export default function NotFound() {
  return <ErrorPanel kind="not_found" />;
}
