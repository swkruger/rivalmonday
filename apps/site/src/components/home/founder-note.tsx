import Image from 'next/image';
import { FOUNDER_NOTE, type FounderNote as Note } from '../../../content/founder';
import { HomeSectionShell } from './section-heading';

/** Hidden while the owner has not supplied the note. `note` is injectable for tests. */
export function FounderNote({ note = FOUNDER_NOTE }: { note?: Note | null }) {
  if (!note) return null;
  return (
    <HomeSectionShell id="founder" className="border-t border-line py-14">
      <figure className="mx-auto flex max-w-3xl flex-col items-start gap-5 sm:flex-row">
        {note.photo ? (
          <Image src={note.photo} alt={note.name} width={64} height={64} className="size-16 shrink-0 rounded-full object-cover" />
        ) : (
          <span aria-hidden="true" className="flex size-16 shrink-0 items-center justify-center rounded-full bg-muted-surface text-lg font-semibold text-ink">{note.initials}</span>
        )}
        <div>
          <blockquote className="text-base text-ink">{note.paragraph}</blockquote>
          <figcaption className="mt-3 text-sm text-ink-secondary">
            <span className="font-semibold text-ink">{note.name}</span>, {note.role}
          </figcaption>
        </div>
      </figure>
    </HomeSectionShell>
  );
}
