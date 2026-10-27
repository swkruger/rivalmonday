import { ListDetailSheet } from './list-detail-sheet';
import { type PeekNav, PeekPanel } from './peek-panel';

export interface ListDetailProps {
  list: React.ReactNode;
  /** What the detail shows (rendered for `selectedId`). */
  detail: React.ReactNode;
  /** lg: the auto-selected or URL item; null shows `empty`. */
  selectedId: string | null;
  /** The URL names an item (?event= / ?move=): opens the phone sheet. */
  sheetOpen: boolean;
  /** The list URL without the item param. */
  closeHref: string;
  listLabel: string;
  detailTitle: string;
  empty?: React.ReactNode;
  /** Changes (16c P3): the lg column becomes a peek panel with previous / next / close and Esc. The Sheet is unchanged. */
  peek?: PeekNav;
}

/**
 * 15c §4 C9 / 15c-2b D15: list + detail. On `lg`+ a two-column layout; below, the list alone, with the detail in a
 * Sheet only when the URL names an item. The detail renders twice (CSS-hidden column + Sheet while open) by design (P13).
 * With `peek` (16c P3) the lg column is a `PeekPanel`; without it (Moves) the markup is unchanged.
 */
export function ListDetail({ list, detail, selectedId, sheetOpen, closeHref, listLabel, detailTitle, empty, peek }: ListDetailProps) {
  const sheet = selectedId ? (
    <ListDetailSheet open={sheetOpen} closeHref={closeHref} title={detailTitle}>{detail}</ListDetailSheet>
  ) : null;
  if (peek) {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(440px,58%)] lg:gap-0">
        <section aria-label={listLabel} className="min-w-0 lg:pr-6">{list}</section>
        <div className="hidden lg:block">
          <PeekPanel label={detailTitle} nav={peek}>{selectedId ? detail : empty}</PeekPanel>
        </div>
        {sheet}
      </div>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
      <section aria-label={listLabel}>{list}</section>
      <div className="hidden lg:block">{selectedId ? detail : empty}</div>
      {sheet}
    </div>
  );
}
