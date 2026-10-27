'use client';
import type { AdMatch } from '@cs/tools';
import { useActionState } from 'react';
import { confirmAdMatchAction, removeAdMatchAction } from '@/app/(app)/c/[clientId]/competitors/actions';
import { useReadOnly } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import { ErrorNote } from '@/components/form-error';

type Matched = { platform: 'google' | 'meta'; accountId: string; name: string | null };
const PLATFORM = { google: 'Google', meta: 'Meta' } as const;

const chip = 'inline-flex items-center gap-2 rounded-full border border-line bg-muted-surface px-3 py-1 text-xs text-ink';
const link = 'font-semibold text-primary-soft-text underline-offset-2 hover:underline disabled:opacity-50';

/**
 * Ad-account matches for a tracked competitor (managers only; the page decides). The result message lives here, which
 * stays mounted when a chip disappears after revalidation.
 */
export function AdMatchChips({ clientId, competitorId, matched, pending }: { clientId: string; competitorId: string; matched: Matched[]; pending: AdMatch[] }) {
  const readOnly = useReadOnly();
  const [confirmed, confirm, confirming] = useActionState(confirmAdMatchAction, { ok: true } as FormResult);
  const [removed, remove, removing] = useActionState(removeAdMatchAction, { ok: true } as FormResult);
  const busy = confirming || removing;
  const results = [confirmed, removed];
  const result = results.find((r) => !r.ok && r.error) ?? results.find((r) => r.ok && r.message);
  if (matched.length === 0 && pending.length === 0 && !result) return null;

  const fields = (platform: string, accountId: string) => (
    <>
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="competitorId" value={competitorId} />
      <input type="hidden" name="platform" value={platform} />
      <input type="hidden" name="accountId" value={accountId} />
    </>
  );

  return (
    <div className="flex flex-col gap-2">
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Ad accounts">
        {matched.map((m) => {
          const label = `${PLATFORM[m.platform]} ${m.name ?? m.accountId}`;
          return (
            <li key={`${m.platform}:${m.accountId}`} className={chip}>
              <span className="font-semibold">{label}</span>
              <span className="text-muted-foreground">Matched automatically</span>
              {!readOnly && (
                <form action={remove}>
                  {fields(m.platform, m.accountId)}
                  <button type="submit" className={link} disabled={busy} aria-label={`Remove ${label}`}>Remove</button>
                </form>
              )}
            </li>
          );
        })}
        {pending.map((m) => (
          <li key={`${m.platform}:${m.accountId}`} className={chip}>
            <span className="font-semibold">Possible {PLATFORM[m.platform]} account: {m.name}</span>
            {!readOnly && (
              <>
                <form action={confirm}>
                  {fields(m.platform, m.accountId)}
                  <button type="submit" className={link} disabled={busy} aria-label={`Confirm ${PLATFORM[m.platform]} account ${m.name}`}>Confirm</button>
                </form>
                <form action={remove}>
                  {fields(m.platform, m.accountId)}
                  <button type="submit" className={link} disabled={busy} aria-label={`Remove ${PLATFORM[m.platform]} account ${m.name}`}>Remove</button>
                </form>
              </>
            )}
          </li>
        ))}
      </ul>
      {result && !result.ok && <ErrorNote focusKey={result} className="text-sm">{result.error}</ErrorNote>}
      {result && result.ok && result.message && <p className="rounded-md bg-muted-surface p-3 text-sm text-ink">{result.message}</p>}
    </div>
  );
}
