/** Hint text under a form field. Wire the field with `useFieldHint(id).describedBy` so screen readers announce it. */
export function useFieldHint(id: string): { hintId: string; describedBy: { 'aria-describedby': string } } {
  const hintId = `${id}-hint`;
  return { hintId, describedBy: { 'aria-describedby': hintId } };
}

export function FieldHint({ id, children }: { id: string; children: React.ReactNode }) {
  return <p id={useFieldHint(id).hintId} className="mt-1 text-xs text-muted-ink">{children}</p>;
}
