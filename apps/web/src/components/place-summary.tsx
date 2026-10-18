import type { SetupLookup } from '@cs/db';
import { BadgeCheck } from 'lucide-react';

/** Phase 11 fixes D4: the card body for a Google Maps business match. The caller keeps the surrounding `<button aria-pressed>`. */
export function PlaceSummary({ place, isClaimed, possibleDuplicate }: { place: SetupLookup; isClaimed: boolean | null; possibleDuplicate: boolean }) {
  const rating = place.rating !== null ? `${place.rating} ★${place.votes !== null ? ` ${place.votes.toLocaleString('en-US')} reviews` : ''}` : null;
  const reputation = [place.category, rating].filter(Boolean).join(' · ');
  const contact = [place.phone, place.domain].filter(Boolean).join(' · ');
  return (
    <>
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{place.title}</span>
        {isClaimed === true && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-soft-text">
            <BadgeCheck aria-hidden className="size-3.5" />
            Owner-verified
          </span>
        )}
        {possibleDuplicate && <span className="rounded-full bg-muted-surface px-2 py-0.5 text-xs font-medium text-ink">Possible duplicate listing</span>}
      </span>
      {place.address ? <span className="text-sm text-muted-foreground">{place.address}</span> : <span className="text-sm text-muted-foreground">Address hidden — service-area business</span>}
      {reputation && <span className="text-sm text-muted-foreground">{reputation}</span>}
      {contact && <span className="text-sm text-muted-foreground">{contact}</span>}
    </>
  );
}

export function DuplicateHint() {
  return <p role="note" className="rounded-lg bg-muted-surface p-3 text-sm text-ink">Google shows more than one listing with the same phone number or website. Pick the owner-verified one if it&apos;s there.</p>;
}
