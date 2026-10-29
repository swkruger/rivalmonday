import { Button, DialogDescription, DialogHeader, DialogTitle, Field, Input, nativeSelectClass } from '@cs/ui';
import verticals from '../../../content/verticals.json';
import { FIELD_MAX, type BusinessForm, type FieldErrors } from '../../lib/waitlist-body';
import { JOIN_COPY } from './copy';

/** Field order = focus order for the first invalid field. */
export const BUSINESS_FIELD_ORDER = ['contactName', 'email', 'orgName', 'website', 'location', 'vertical', 'verticalOther'] as const;

export function StepBusiness({ form, errors, pending, formError, onChange, onBack }: {
  form: BusinessForm;
  errors: FieldErrors;
  pending: boolean;
  formError: string | null;
  onChange: (patch: Partial<BusinessForm>) => void;
  onBack: () => void;
}) {
  const c = JOIN_COPY.business;
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
        <Field label={c.website} help={c.hint} error={errors.website}>
          <Input id="join-website" name="website" inputMode="url" autoComplete="url" maxLength={FIELD_MAX.website} value={form.website} onChange={(e) => onChange({ website: e.target.value })} />
        </Field>
        <Field label={c.location} error={errors.location}>
          <Input id="join-location" name="location" maxLength={FIELD_MAX.location} value={form.location} onChange={(e) => onChange({ location: e.target.value })} />
        </Field>
        <Field label={c.vertical} required error={errors.vertical}>
          <select id="join-vertical" name="vertical" className={`${nativeSelectClass} w-full`} value={form.vertical} onChange={(e) => onChange({ vertical: e.target.value })}>
            <option value="">{c.verticalPlaceholder}</option>
            {verticals.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            <option value="other">{c.other}</option>
          </select>
        </Field>
        {form.vertical === 'other' ? (
          <Field label={c.verticalOther} required error={errors.verticalOther}>
            <Input id="join-verticalOther" name="verticalOther" maxLength={FIELD_MAX.verticalOther} value={form.verticalOther} onChange={(e) => onChange({ verticalOther: e.target.value })} />
          </Field>
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
