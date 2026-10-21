'use client';
import { HelpClientProvider, useHelp } from './help-context';

/** R8: merges the `/c/<id>` client's name into the surrounding help value (the shell cannot see the path for agency viewers). */
export function ClientHelpName({ name, children }: { name: string; children: React.ReactNode }) {
  const parent = useHelp();
  return <HelpClientProvider value={{ ...parent, names: { ...parent.names, client: name } }}>{children}</HelpClientProvider>;
}
