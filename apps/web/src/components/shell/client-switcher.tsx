'use client';
import type { ClientSummary } from '@cs/tools';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@cs/ui';
import { useRouter } from 'next/navigation';

export function ClientSwitcher({ clients, currentClientId }: { clients: ClientSummary[]; currentClientId: string | null }) {
  const router = useRouter();
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
