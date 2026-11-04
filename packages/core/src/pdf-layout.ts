/**
 * Raise after any change to how a brief or report PDF looks. The version is part of the stored file name, so a PDF
 * rendered with an older layout no longer counts as stored and is rendered again the next time it is opened.
 * Version 1 is the unversioned `<id>.pdf`; version 2 is the single-table trend table (2026-10-06); version 3 adds the starting-point/quiet scorecard (2026-10-15); version 4 has the larger email text (2026-11-02); version 5 has 16 px scorecard/trend-table cells and short scorecard headers with a key (2026-11-03).
 */
export const PDF_LAYOUT_VERSION = 5;
export const PDF_KEY_SUFFIX = `.v${PDF_LAYOUT_VERSION}.pdf`;
export const isCurrentPdfKey = (key: string) => key.endsWith(PDF_KEY_SUFFIX);
