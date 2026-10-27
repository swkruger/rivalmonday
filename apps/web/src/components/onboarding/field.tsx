import { Label } from '@cs/ui';

/** L7 inputs: border #8796AB (spec 16 §3). */
export const INPUT_CLASS = 'h-10 border-[#8796AB]';
export const SELECT_CLASS = 'h-10 w-full rounded-md border border-[#8796AB] bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** A labelled field: required = red `*` plus "(required)" for screen readers; optional = muted "(optional)". */
export function Field({ id, label, required, optional, hint, children }: { id: string; label: string; required?: boolean; optional?: boolean; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {required && (
          <>
            <span aria-hidden="true" className="ml-0.5 text-destructive">*</span>
            <span className="sr-only"> (required)</span>
          </>
        )}
        {optional && <span className="font-normal text-muted-ink"> (optional)</span>}
      </Label>
      {children}
      {hint && <p className="text-13 text-muted-ink">{hint}</p>}
    </div>
  );
}
