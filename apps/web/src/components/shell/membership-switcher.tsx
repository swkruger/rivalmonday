import type { MembershipSummary } from '@cs/tools';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@cs/ui';
import { ChevronDown } from 'lucide-react';
import { switchMembership } from '@/app/(app)/actions';

function label(m: MembershipSummary): string {
  return m.clientName ? `${m.agencyName} · ${m.clientName}` : m.agencyName;
}

/** Lets a user with more than one membership (e.g. an agency admin who is also a client contact) switch between them. */
export function MembershipSwitcher({ memberships, currentId }: { memberships: MembershipSummary[]; currentId: string }) {
  const current = memberships.find((m) => m.id === currentId) ?? memberships[0]!;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium">
        {label(current)}
        <ChevronDown className="h-4 w-4 text-muted-ink" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {memberships.map((m) => (
          <form key={m.id} action={switchMembership}>
            <input type="hidden" name="membershipId" value={m.id} />
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full text-left">
                {label(m)}
              </button>
            </DropdownMenuItem>
          </form>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
