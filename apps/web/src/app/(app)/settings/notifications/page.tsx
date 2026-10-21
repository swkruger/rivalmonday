import { myNotificationSettings } from '@cs/tools';
import { Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { requireContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { helpGuides } from '@/server/help';
import { NOTIFICATION_KIND_LABELS } from '@/server/inbox';
import { timezoneOptions } from '@/server/timezones';
import { ContactForm } from './contact-form';
import { PrefSwitch } from './pref-switch';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Notification settings' };

const HELP_KEY = 'page:account.settings.notifications';
const COPY = PAGE_COPY['account.settings.notifications'];

export default async function NotificationSettingsPage() {
  const { viewer, ctx } = await requireContext();
  if (viewer.kind !== 'user') notFound();
  // /settings/notifications is outside /agency, /c and /platform, so the guide drawer reads the agency scope (helpScopeOf); read the same one here.
  const [settings, guides] = await Promise.all([myNotificationSettings(dbs().service, viewer.userId), helpGuides(ctx, 'agency')]);

  return (
    <>
      <PageHeader
        title="Notification settings"
        breadcrumb={[{ label: 'Notification settings' }]}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      {settings.length === 0 ? (
        <EmptyState {...COPY.empty.none} guideAnchor="how-to-use-it" />
      ) : (
        <>
          <TipRow
            items={[
              { label: 'In-app and email', tip: 'account.settings.notifications.channels' },
              { label: 'Quiet hours', tip: 'account.settings.notifications.quiet' },
              { label: 'Time zone', tip: 'account.settings.notifications.timezoneAgency' },
              { label: 'Time zone', tip: 'account.settings.notifications.timezoneClient' },
              { label: 'Agency notices', tip: 'account.settings.notifications.agencyKinds' },
              { label: 'Notices about your business', tip: 'account.settings.notifications.clientKinds' },
              ...(settings.length > 1 ? [{ label: 'More than one list', tip: 'account.settings.notifications.several' as const }] : []),
            ]}
          />
          {settings.map((s) => (
            <Card key={s.contactId}>
              <CardHeader>
                <CardTitle>{s.clientName ?? s.agencyName}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <Table aria-label="Notification preferences">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Notification</TableHead>
                      <TableHead>In-app</TableHead>
                      <TableHead>Email</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.kinds.map((k) => {
                      const label = NOTIFICATION_KIND_LABELS[k.kind] ?? k.kind;
                      return (
                        <TableRow key={k.kind}>
                          <TableCell>{label}</TableCell>
                          <TableCell>
                            <PrefSwitch contactId={s.contactId} kind={k.kind} channel="in_app" enabled={k.channels.in_app} label={`${label}, in-app`} />
                          </TableCell>
                          <TableCell>
                            <PrefSwitch contactId={s.contactId} kind={k.kind} channel="email" enabled={k.channels.email} label={`${label}, email`} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <ContactForm contactId={s.contactId} timezone={s.timezone} quietHours={s.quietHours} timezoneOptions={timezoneOptions(s.timezone ?? 'UTC')} />
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </>
  );
}
