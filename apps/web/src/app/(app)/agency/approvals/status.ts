/** Shared between the queue table and the review page so the two screens never drift on wording. */
export const STATUS_LABEL: Record<string, string> = {
  ready: 'Needs review',
  approved: 'Approved',
  sent: 'Sent',
  failed: 'Failed — retrying',
  generating: 'Drafting',
};
