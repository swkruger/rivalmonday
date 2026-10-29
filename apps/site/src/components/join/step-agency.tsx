import { Button, DialogDescription, DialogHeader, DialogTitle, Field, Input, nativeSelectClass } from '@cs/ui';
import { CLIENT_BANDS, FIELD_MAX, type AgencyForm, type FieldErrors } from '../../lib/waitlist-body';
import { JOIN_COPY } from './copy';

/** Field order = focus order for the first invalid field. */
export const AGENCY_FIELD_ORDER = ['contactName', 'email', 'orgName', 'website', 'clientCountBand', 'sampleBusinessName', 'sampleWebsite', 'sampleLocation'] as const;

export function StepAgency({ form, errors, pending, formError, onChange, onBack }: {
  form: AgencyForm;
  errors: FieldErrors;
  pending: boolean;
  formError: string | null;
  onChange: (patch: Partial<AgencyForm>) => void;
  onBack: () => void;
}) {
  const c = JOIN_COPY.agency;
  return (
    <>
      <DialogHeader>
        <p className="text-xs text-muted-ink">{c.eyebrow}</p>
        <DialogTitle className="text-lg leading-snug">{c.title}</DialogTitle>
        <DialogDescription>{c.sub}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        <Field label={c.name} required error={errors.contactName}>
          <Input id="join-contactName" name="contactName" autoComplete="name" maxLength={FIELD_MAX.contactName} value={form.contactName} onChange={(e) => onChange({ contactName: e.target.value })} />
        </Field>
        <Field label={c.email} required error={errors.email}>
          <Input id="join-email" name="email" type="email" autoComplete="email" maxLength={FIELD_MAX.email} value={form.email} onChange={(e) => onChange({ email: e.target.value })} />
        </Field>
        <Field label={c.orgName} required error={errors.orgName}>
          <Input id="join-orgName" name="orgName" autoComplete="organization" maxLength={FIELD_MAX.orgName} value={form.orgName} onChange={(e) => onChange({ orgName: e.target.value })} />
        </Field>
        <Field label={c.website} optional error={errors.website}>
          <Input id="join-website" name="website" inputMode="url" autoComplete="url" maxLength={FIELD_MAX.website} value={form.website} onChange={(e) => onChange({ website: e.target.value })} />
        </Field>
        <Field label={c.band} required error={errors.clientCountBand}>
          <select id="join-clientCountBand" name="clientCountBand" className={`${nativeSelectClass} w-full`} value={form.clientCountBand} onChange={(e) => onChange({ clientCountBand: e.target.value as AgencyForm['clientCountBand'] })}>
            <option value="">{c.bandPlaceholder}</option>
            {CLIENT_BANDS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        </Field>
        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={form.wantsSample} onChange={(e) => onChange({ wantsSample: e.target.checked })} />
          <span>{c.wantsSample}</span>
        </label>
        {form.wantsSample ? (
          <div className="flex flex-col gap-3 rounded-md bg-canvas p-3">
            <Field label={c.sampleName} required error={errors.sampleBusinessName}>
              <Input id="join-sampleBusinessName" name="sampleBusinessName" maxLength={FIELD_MAX.sampleBusinessName} value={form.sampleBusinessName} onChange={(e) => onChange({ sampleBusinessName: e.target.value })} />
            </Field>
            <Field label={c.sampleWebsite} help={c.sampleHint} error={errors.sampleWebsite}>
              <Input id="join-sampleWebsite" name="sampleWebsite" inputMode="url" maxLength={FIELD_MAX.website} value={form.sampleWebsite} onChange={(e) => onChange({ sampleWebsite: e.target.value })} />
            </Field>
            <Field label={c.sampleLocation} error={errors.sampleLocation}>
              <Input id="join-sampleLocation" name="sampleLocation" maxLength={FIELD_MAX.location} value={form.sampleLocation} onChange={(e) => onChange({ sampleLocation: e.target.value })} />
            </Field>
          </div>
        ) : null}
      </div>
      {formError ? <p role="alert" className="text-sm text-danger-text">{formError}</p> : null}
      {/* Task 8 renders the Turnstile widget here, above the submit row. */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>{JOIN_COPY.back}</Button>
        <Button type="submit" disabled={pending}>{c.submit}</Button>
      </div>
      <p className="text-xs text-muted-ink">{c.fine}</p>
    </>
  );
}
