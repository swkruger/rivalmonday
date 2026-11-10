'use client';

import { createContext, useContext } from 'react';
import { usePathname } from 'next/navigation';
import { sideOf, type Side } from '../../lib/side';

type SidePaths = { agency: string[]; business: string[] };

const SideContext = createContext<SidePaths | null>(null);

/** Holds the server-built side lists; the side itself is derived from the pathname, never stored. */
export function SideProvider({ paths, children }: { paths: SidePaths; children: React.ReactNode }) {
  return <SideContext.Provider value={paths}>{children}</SideContext.Provider>;
}

export function useSide(): Side {
  const paths = useContext(SideContext);
  const pathname = usePathname();
  if (!paths) throw new Error('useSide must be used inside SideProvider');
  return sideOf(pathname, paths);
}

/** Like `useSide`, but `home` outside a `SideProvider` (the join popup also mounts in isolation). */
export function useSideOrHome(): Side {
  const paths = useContext(SideContext);
  const pathname = usePathname();
  return paths && pathname ? sideOf(pathname, paths) : 'home';
}
