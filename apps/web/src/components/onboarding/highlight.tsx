/** Preview-panel marker (L7): a dashed accent outline around the part of the preview the focused field changes. */
export function Highlight({ active, children }: { active: boolean; children: React.ReactNode }) {
  return <div className={active ? 'rounded-sm outline-2 outline-offset-[3px] outline-dashed outline-amber' : undefined}>{children}</div>;
}
