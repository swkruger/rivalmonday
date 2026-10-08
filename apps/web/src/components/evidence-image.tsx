'use client';

import { useState } from 'react';

/**
 * A stored evidence screenshot. When its object is missing from the store the file route answers 404; instead of a
 * broken-image icon the viewer shows "Snapshot not available" (Review Focus 5). Plain props only — no `@cs/tools`.
 */
export function EvidenceImage({ src, alt, className, loading }: { src: string; alt: string; className?: string; loading?: 'lazy' | 'eager' }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <p className="rounded-lg bg-muted-surface p-4 text-sm text-muted-foreground">Snapshot not available</p>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading={loading} className={className} onError={() => setFailed(true)} />;
}
