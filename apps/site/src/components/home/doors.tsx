import { CHOOSER } from '../../../content/chooser';

/** The two doors, one link each (the whole card). Surface cards read on the ink hero and on the light band alike. */
export function Doors({ headingId }: { headingId: string }) {
  return (
    <ul aria-labelledby={headingId} className="grid gap-4 sm:grid-cols-2">
      {CHOOSER.doors.map((d) => (
        <li key={d.id} className="flex">
          <a
            href={d.href}
            data-door={d.id}
            className="press flex min-h-11 w-full flex-col gap-2 rounded-card border border-line bg-surface p-5 text-ink hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="text-lg font-semibold">{d.title}</span>
            <span className="text-ink-secondary">{d.body}</span>
            <span className="mt-auto pt-2 text-sm font-medium text-link">{d.cta}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
