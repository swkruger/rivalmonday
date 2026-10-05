import { Bell } from 'lucide-react';
import Link from 'next/link';

export function InboxBell({ unread }: { unread: number }) {
  return (
    <Link
      href="/inbox"
      aria-label={`Inbox, ${unread} unread`}
      className="relative grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-full border border-line bg-surface"
    >
      <Bell className="h-[18px] w-[18px] text-[#475569]" />
      {unread > 0 && <span className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-danger" />}
    </Link>
  );
}
