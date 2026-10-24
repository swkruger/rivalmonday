import { ListDetailSheet } from './list-detail-sheet';

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
}

/**
 * 15c §4 C9 / 15c-2b D15: list + detail. On `lg`+ a two-column layout; below, the list alone, with the detail in a
 * Sheet only when the URL names an item. The detail renders twice (CSS-hidden column + Sheet while open) by design (P13).
 */
export function ListDetail({ list, detail, selectedId, sheetOpen, closeHref, listLabel, detailTitle, empty }: ListDetailProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
      <section aria-label={listLabel}>{list}</section>
      <div className="hidden lg:block">{selectedId ? detail : empty}</div>
      {selectedId ? (
        <ListDetailSheet open={sheetOpen} closeHref={closeHref} title={detailTitle}>{detail}</ListDetailSheet>
      ) : null}
    </div>
  );
}
