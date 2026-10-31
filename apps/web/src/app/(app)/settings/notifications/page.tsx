import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** The notification settings moved into the Profile page; bookmarks and old links land on its Notifications section. */
export default function NotificationSettingsRedirect() {
  redirect('/settings/profile#notifications');
}
