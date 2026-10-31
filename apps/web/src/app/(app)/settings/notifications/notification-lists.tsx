import { Section, Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from '@cs/ui';
import { EmptyState } from '@/components/help/empty-state';
import { TipRow } from '@/components/help/tip-row';
import { PAGE_COPY } from '@/help/copy';
import { NOTIFICATION_KIND_LABELS } from '@/server/inbox';
import { timezoneOptions } from '@/server/timezones';
import { ContactForm } from './contact-form';
import { PrefSwitch } from './pref-switch';

const COPY = PAGE_COPY['account.settings.profile'];

type Lists = {
  contactId: string;
  agencyName: string;
  clientName: string | null;
  timezone: string | null;
  quietHours: { start: string; end: string } | null;
  kinds: { kind: string; channels: Record<string, boolean> }[];
}[];

/** The notification cards (one per list the person receives notices from); rendered inside `/settings/profile`. */
export function NotificationLists({ lists }: { lists: Lists }) {
  if (lists.length === 0) return <EmptyState {...COPY.empty.none} guideAnchor="how-to-use-it" />;
  return (
    <>
      <TipRow
        items={[
          { label: 'In-app and email', tip: 'account.settings.profile.channels' },
          { label: 'Quiet hours', tip: 'account.settings.profile.quiet' },
          { label: 'Time zone', tip: 'account.settings.profile.timezoneAgency' },
          { label: 'Time zone', tip: 'account.settings.profile.timezoneClient' },
          { label: 'Agency notices', tip: 'account.settings.profile.agencyKinds' },
          { label: 'Notices about your business', tip: 'account.settings.profile.clientKinds' },
          ...(lists.length > 1 ? [{ label: 'More than one list', tip: 'account.settings.profile.several' as const }] : []),
        ]}
      />
      {lists.map((s) => (
        <Section key={s.contactId} title={s.clientName ?? s.agencyName}>
          <TableFrame>
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
                        <PrefSwitch contactId={s.contactId} kind={k.kind} channel="in_app" enabled={k.channels.in_app ?? true} label={`${label}, in-app`} />
                      </TableCell>
                      <TableCell>
                        <PrefSwitch contactId={s.contactId} kind={k.kind} channel="email" enabled={k.channels.email ?? true} label={`${label}, email`} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableFrame>
          <ContactForm contactId={s.contactId} timezone={s.timezone} quietHours={s.quietHours} timezoneOptions={timezoneOptions(s.timezone ?? 'UTC')} />
        </Section>
      ))}
    </>
  );
}
