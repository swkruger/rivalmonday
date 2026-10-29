import { describe, expect, it } from 'vitest';
import { scanTsFile } from '../src/scan/ts-scan.js';

const jsx = (src: string) => scanTsFile('fx/a.tsx', src, { surface: 'app-shared', mode: 'jsx' }).map((i) => i.text);
const mod = (src: string) => scanTsFile('fx/a.ts', src, { surface: 'app-shared', mode: 'module' }).map((i) => i.text);

describe('JSX attributes: deny-list (Ruling R8 / I1)', () => {
  const src = `export function D() {
    return <ConfirmDialog
      body="They lose access to this agency immediately."
      submit="End pilot"
      subtitle="Your clients see your logo, not ours."
      help="Shown on every invoice."
      heading={'Plan details'}
      action="Add a rival"
      caption={ok ? 'All good here' : 'Needs a look'}
      htmlFor="Field Label Id"
      role="Dialog Thing"
      autoComplete="Street Address"
      aria-controls="Menu Panel"
      aria-hidden="Not Text"
      aria-describedby="Some Element"
      data-x="Some Data"
      name="Full Name"
      type="Submit Button"
      target="_blank"
      method="post"
      inputMode="Numeric Pad"
      pattern="Upper Case Only"
      formAction="/api/save"
      aria-label="Close the dialog"
      onClick={() => run('Not Shown Text')}
    />;
  }`;

  it('keeps copy in any attribute not on the deny-list', () => {
    const t = jsx(src);
    for (const keep of ['They lose access to this agency immediately.', 'End pilot', 'Your clients see your logo, not ours.',
      'Shown on every invoice.', 'Plan details', 'Add a rival', 'All good here', 'Needs a look', 'Close the dialog']) {
      expect(t).toContain(keep);
    }
  });

  it('drops non-copy attributes (form/field names, types, roles, aria ids, data-*)', () => {
    const t = jsx(src);
    for (const bad of ['Field Label Id', 'Dialog Thing', 'Street Address', 'Menu Panel', 'Not Text', 'Some Element', 'Some Data',
      'Full Name', 'Submit Button', 'Numeric Pad', 'Upper Case Only', '/api/save', 'Not Shown Text']) {
      expect(t).not.toContain(bad);
    }
  });

  it('context names the tag and attribute', () => {
    const items = scanTsFile('fx/a.tsx', src, { surface: 'app-shared', mode: 'jsx' });
    expect(items.find((i) => i.text === 'End pilot')!.context).toBe('<ConfirmDialog submit>');
  });
});

describe('name / type as object properties are display copy (I2)', () => {
  it('keeps name/type values in module mode; JSX name/type stay dropped', () => {
    const t = mod("export const PLANS = [{ name: 'For local businesses', type: 'Monthly plan' }];");
    expect(t).toEqual(['For local businesses', 'Monthly plan']);
    expect(jsx('export const F = () => <input name="Full Name" type="Submit Button" />;')).toEqual([]);
  });
});

describe('user-facing messages (I3)', () => {
  it('keeps result-helper arguments (done/fail/refuse) in any position', () => {
    const t = mod(`
      const fail = (error: string) => ({ ok: false, error });
      export async function act() {
        if (a) return fail('Confirm to disconnect Stripe.');
        await sync();
        return done(id, 'Pilot ended; the trial has started.');
      }`);
    expect(t).toEqual(['Confirm to disconnect Stripe.', 'Pilot ended; the trial has started.']);
  });

  it('keeps .push() string arguments onto message arrays', () => {
    const t = mod(`export function problems(i) {
      const p: string[] = [];
      if (!i.name) p.push('Name is required (up to 120 characters)');
      for (const s of i.services) errors.push(\`Unknown service: \${s}\`);
      return p;
    }`);
    expect(t).toEqual(['Name is required (up to 120 characters)', 'Unknown service: {s}']);
  });

  it('keeps React setter messages in .tsx but not header setters', () => {
    const t = jsx(`export function C() {
      const save = async () => {
        if (bad) { setError('The title cannot contain placeholders.'); return; }
        setUploadError(\`Upload failed: \${why}\`);
        setTab('overview');
        res.setHeader('Cache-Control', 'no-store');
      };
      return <button onClick={() => setNotice('Saved for later.')}>Save</button>;
    }`);
    expect(t).toEqual(['The title cannot contain placeholders.', 'Upload failed: {why}', 'Saved for later.', 'Save']);
  });

  it('keeps zod messages and describe text, drops enum/literal/default values', () => {
    const t = mod(`
      const Zip = z.string().regex(/^\\d{5}$/, { message: 'Enter a 5-digit ZIP code' });
      export const Input = z.object({
        name: z.string().trim().min(1, 'Enter the business name.').max(120, { error: 'Keep it under 120 characters.' }),
        tz: z.string().refine((v) => v !== 'Bad Zone Value', 'Unknown time zone'),
        role: z.enum(['Owner Role', 'Admin Role'], { error: 'Pick a role.' }),
        kind: z.literal('Some Literal Value'),
        note: z.string().default('Default Note Text'),
        clientId: z.string().describe('The client to look up.'),
        plan: z.string({ error: 'Pick a plan.' }),
        at: z.string().refine((v) => ok(v), { message: 'Must be in the future', path: ['Path Segment'] }),
      });`);
    expect(t).toEqual([
      'Enter a 5-digit ZIP code', 'Enter the business name.', 'Keep it under 120 characters.', 'Unknown time zone', 'Pick a role.',
      'The client to look up.', 'Pick a plan.', 'Must be in the future',
    ]);
  });

  it('message literals are not duplicated when also a property value', () => {
    const t = mod("export const X = { error: fail('Try again shortly.') };");
    expect(t).toEqual(['Try again shortly.']);
  });
});
