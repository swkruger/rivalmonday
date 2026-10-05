import { myNotificationSettings } from '@cs/tools';
import { Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { NOTIFICATION_KIND_LABELS } from '@/server/inbox';
import { timezoneOptions } from '@/server/timezones';
import { ContactForm } from './contact-form';
import { PrefSwitch } from './pref-switch';

export const dynamic = 'force-dynamic';

export default async function NotificationSettingsPage() {
  const { viewer } = await requireContext();
  if (viewer.kind !== 'user') notFound();
  const settings = await myNotificationSettings(dbs().service, viewer.userId);

  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">Notification settings</h1>
      {settings.length === 0 ? (
        <p className="text-muted-foreground">You have no notification settings yet.</p>
      ) : (
        settings.map((s) => (
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
        ))
      )}
    </>
  );
}
