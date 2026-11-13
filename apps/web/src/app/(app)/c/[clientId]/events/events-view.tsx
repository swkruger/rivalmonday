import type { ListedEventsView } from '@cs/tools';
import { Section, StatusChip } from '@cs/ui';
import { HelpTip } from '@/components/help/help-tip';
import { EVENT_SOURCE, LISTED_EVENT_STATUS, labelFor } from '@/lib/labels';

type Event = ListedEventsView['events'][number];

const EMPTY = 'No upcoming events found for you or your rivals yet.';
// Draft → copy review: shown when an event has a date but no start time.
const NO_TIME = 'Time not listed';

/** The weekday and day in the viewer's zone ("Friday, November 13"); `startDate` is a calendar day, never shifted. */
const dayHeading = (startDate: string) => new Date(`${startDate}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });

function timeOf(startsAt: string | null, tz: string): string {
  if (!startsAt) return NO_TIME;
  const at = new Date(startsAt);
  if (Number.isNaN(at.getTime())) return NO_TIME;
  let zone = tz;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { zone = 'UTC'; }
  return at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: zone });
}

function Row({ event, tz }: { event: Event; tz: string }) {
  const status = labelFor(LISTED_EVENT_STATUS, event.status);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-3 text-sm">
      <span className="min-w-0 basis-full font-semibold text-ink sm:basis-[14rem]">{event.self ? `${event.businessName} (you)` : event.businessName}</span>
      <span className="min-w-0 flex-1 basis-[12rem] break-words text-ink">
        {event.url
          ? <a href={event.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-soft-text">{event.name}</a>
          : event.name}
      </span>
      <span className="text-muted-ink">{timeOf(event.startsAt, tz)}</span>
      <span className="flex flex-wrap items-center gap-1.5">
        {event.sources.map((s) => <StatusChip key={s} tone="neutral">{labelFor(EVENT_SOURCE, s).label}</StatusChip>)}
      </span>
      <StatusChip tone={status.tone}>{status.label}</StatusChip>
    </li>
  );
}

/** 18d Events page body: one white sheet, a section per date (the tool returns date order, the client first on a shared date). */
export function EventsView({ events, tz }: { events: Event[]; tz: string }) {
  if (events.length === 0) {
    return <p className="rounded-md bg-muted-surface p-3 text-sm text-ink">{EMPTY}</p>;
  }
  const days = [...new Set(events.map((e) => e.startDate))];
  return (
    <>
      {days.map((day, i) => (
        <Section key={day} title={dayHeading(day)} titleAside={i === 0 ? <HelpTip tip="client.events.google" /> : undefined}>
          <ul className="flex flex-col divide-y divide-line">
            {events.filter((e) => e.startDate === day).map((e) => <Row key={e.id} event={e} tz={tz} />)}
          </ul>
        </Section>
      ))}
    </>
  );
}
