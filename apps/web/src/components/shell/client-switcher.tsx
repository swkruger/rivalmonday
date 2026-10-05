'use client';
import type { ClientSummary } from '@cs/tools';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@cs/ui';
import { usePathname, useRouter } from 'next/navigation';
import { clientIdFromPath } from './nav-items';

/** Reads the selected client from the live pathname (not a server-computed prop) so it tracks client-side navigation — see Sidebar's doc comment. */
export function ClientSwitcher({ clients }: { clients: ClientSummary[] }) {
  const router = useRouter();
  const currentClientId = clientIdFromPath(usePathname());
  return (
    <Select value={currentClientId ?? undefined} onValueChange={(id) => router.push(`/c/${id}`)}>
      <SelectTrigger className="min-w-[270px] font-semibold">
        <SelectValue placeholder="Choose a client" />
      </SelectTrigger>
      <SelectContent>
        {clients.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
