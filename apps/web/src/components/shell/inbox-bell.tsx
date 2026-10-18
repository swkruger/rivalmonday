import { Bell } from 'lucide-react';
import Link from 'next/link';

/** Spec §2.9: the bell carries the unread count ("9+" above nine); the label always has the full count. */
export function InboxBell({ unread }: { unread: number }) {
  return (
    <Link
      href="/inbox"
      aria-label={`Inbox, ${unread} unread`}
      className="relative grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-full border border-border bg-surface"
    >
      <Bell aria-hidden className="h-[18px] w-[18px] text-[#475569]" />
      {unread > 0 && (
        <span aria-hidden className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[11px] font-bold leading-none text-white">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  );
}
