const LABEL: Record<string, string> = {
  ok: '',
  not_found: 'Not found',
  vendor_error: 'Data provider error',
  skipped: 'Not set up',
  post_failed: 'Retrying',
};

/** Readable text for a data source's last run status (decided copy); unknown values are humanised, never raw snake_case. */
export function sourceStatusLabel(status: string | null): string {
  if (!status) return '';
  return status in LABEL ? LABEL[status]! : status.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
