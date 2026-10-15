/**
 * Raise after any change to how a brief or report PDF looks. The version is part of the stored file name, so a PDF
 * rendered with an older layout no longer counts as stored and is rendered again the next time it is opened.
 * Version 1 is the unversioned `<id>.pdf`; version 2 is the single-table trend table (2026-10-06); version 3 adds the starting-point/quiet scorecard (2026-10-15).
 */
export const PDF_LAYOUT_VERSION = 3;
export const PDF_KEY_SUFFIX = `.v${PDF_LAYOUT_VERSION}.pdf`;
export const isCurrentPdfKey = (key: string) => key.endsWith(PDF_KEY_SUFFIX);
