import { helpCopyFor } from '@/help/copy/payload';
import { HelpClientProvider, type HelpViewer } from './help-context';

/**
 * Server side of the help provider (final review I1, spec 15b §3): resolves the short help copy for `value.audience` and
 * hands only that slice to the client components (`HelpTip`, `TipRow`, `EmptyState`). The audience is per viewer, not
 * per path, so the shell's layout computing it once per full load is enough. Never import this from a client module.
 */
export function HelpProvider({ value, children }: { value: HelpViewer; children: React.ReactNode }) {
  return <HelpClientProvider value={{ ...value, copy: helpCopyFor(value.audience) }}>{children}</HelpClientProvider>;
}
