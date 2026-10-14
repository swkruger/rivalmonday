import type { FormResult } from '@/server/forms';

export const selectClass = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

export function FormMessage({ state }: { state: FormResult }) {
  if (!state.ok) return <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">{state.error}</p>;
  return state.message ? <p role="status" className="rounded-lg bg-muted-surface p-3 text-ink">{state.message}</p> : null;
}
