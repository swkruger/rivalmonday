'use client';
import { useLayoutEffect } from 'react';

/**
 * Phase 8b M1: each shell is the single source of its theme. `AppShell` puts its viewer's vars on a wrapper (server
 * rendered, so no flash); this mirrors them onto `<html>` while the shell is mounted, for what renders outside the
 * wrapper — portalled dialogs, menus and selects — and because the root layout is not re-rendered on a client-side
 * navigation between `(app)` and `(platform)`. Unmounting restores what was there. `vars` only ever holds the
 * validated hex colours `themeVars` returns (Review Focus 5).
 */
export function ShellTheme({ vars }: { vars: Record<string, string> }) {
  const key = JSON.stringify(vars);
  useLayoutEffect(() => {
    const style = document.documentElement.style;
    const entries = Object.entries(JSON.parse(key) as Record<string, string>);
    const previous = entries.map(([k]) => [k, style.getPropertyValue(k)] as const);
    for (const [k, v] of entries) style.setProperty(k, v);
    return () => {
      for (const [k, v] of previous) {
        if (v) style.setProperty(k, v);
        else style.removeProperty(k);
      }
    };
  }, [key]);
  return null;
}
