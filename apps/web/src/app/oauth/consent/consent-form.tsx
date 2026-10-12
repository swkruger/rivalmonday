'use client';
import type { TokenScope } from '@cs/core';
import { Button, Label } from '@cs/ui';
import { useActionState, useState } from 'react';
import type { FormResult } from '@/server/forms';
import { decideConsent } from './actions';

export interface ConsentFormOption { membershipId: string; label: string; scopes: TokenScope[] }

const ACCESS: Record<TokenScope, string> = {
  read: 'Read only: see changes, evidence, briefs, alerts and recommendations',
  feedback: 'Read and feedback: also rate changes, update and add recommendations',
  manage: 'Read, feedback and manage: also change alert rules, client profiles and pinned pages, and run prospect snapshots',
};
const selectClass = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

export function ConsentForm({ appName, productName, oauthQuery, options, redirectHost = null }: {
  appName: string;
  productName: string;
  oauthQuery: string;
  options: ConsentFormOption[];
  /** Host (and non-default port) of the verified redirect_uri; null omits the line. */
  redirectHost?: string | null;
}) {
  const [state, formAction, pending] = useActionState(decideConsent, { ok: true } as FormResult);
  const [membershipId, setMembershipId] = useState(options[0]?.membershipId ?? '');
  const selected = options.find((o) => o.membershipId === membershipId) ?? options[0];
  // Default = the lowest level (Read only, owner decision); the user can pick higher. Resets when the workspace changes.
  const [scope, setScope] = useState<TokenScope | undefined>(undefined);
  const offered = selected?.scopes ?? [];
  const chosen = scope && offered.includes(scope) ? scope : offered.includes('read') ? 'read' : offered[0];

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {!state.ok && (
        <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">
          {state.error}
        </p>
      )}
      <input type="hidden" name="oauth_query" value={oauthQuery} />
      {options.length === 0 ? (
        <p className="text-ink">You don&apos;t have a workspace this app can connect to. Ask your agency to turn on AI connections for your business.</p>
      ) : (
        <>
          <p className="text-ink">
            <strong>{appName}</strong> wants to use your {productName} data. It will act as you, within the access you choose.
          </p>
          {redirectHost && (
            <p className="text-ink">
              After you allow, you&apos;ll be sent to <strong>{redirectHost}</strong>.
            </p>
          )}
          <div className="flex flex-col gap-2">
            {options.length === 1 ? (
              <>
                <span className="text-sm font-medium text-ink">Workspace</span>
                <p className="text-ink">{options[0]!.label}</p>
                <input type="hidden" name="membershipId" value={options[0]!.membershipId} />
              </>
            ) : (
              <>
                <Label htmlFor="consent-workspace">Workspace</Label>
                <select
                  id="consent-workspace"
                  name="membershipId"
                  className={selectClass}
                  value={membershipId}
                  onChange={(e) => {
                    setMembershipId(e.target.value);
                    setScope(undefined);
                  }}
                >
                  {options.map((o) => (
                    <option key={o.membershipId} value={o.membershipId}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium text-ink">Access</legend>
            {offered.map((s) => (
              <label key={s} className="flex items-start gap-2 text-sm text-ink">
                <input type="radio" name="scope" value={s} checked={chosen === s} onChange={() => setScope(s)} className="mt-1" />
                <span>{ACCESS[s]}</span>
              </label>
            ))}
          </fieldset>
        </>
      )}
      <div className="flex gap-3">
        {options.length > 0 && (
          <Button type="submit" name="decision" value="allow" disabled={pending}>
            Allow
          </Button>
        )}
        <Button type="submit" name="decision" value="deny" variant="outline" disabled={pending}>
          Cancel
        </Button>
      </div>
      {options.length > 0 && <p className="text-sm text-muted-foreground">You can disconnect it at any time under AI connections.</p>}
    </form>
  );
}
