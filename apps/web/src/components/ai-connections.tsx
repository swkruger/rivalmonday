'use client';
import type { TokenScope } from '@cs/core';
import type { ApiTokenView, OAuthGrantView } from '@cs/tools';
import {
  Button, Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
  Field, Input, nativeSelectClass, Section, Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow,
} from '@cs/ui';
import { type ReactNode, useActionState, useEffect, useRef, useState } from 'react';
import { formatDate } from '@/lib/format';
import { useReadOnly } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import { ErrorNote } from '@/components/form-error';

/**
 * Phase 6a "AI connections" cards, shared by `/c/<id>/settings/ai` and `/agency/settings/ai`; the page passes its own server
 * actions. A new token's text lives only in this component's state (the create action's result): never logged, never
 * in a URL, never in browser storage. Every action result is held by the always-mounted card, not by the row or
 * dialog that triggered it, so it survives the `revalidatePath` that removes that row (apps/web CLAUDE.md).
 */

/** The create action's result: on success it carries the token, shown once. */
export type CreateTokenResult = { ok: true; message?: string; id?: string; token?: string; prefix?: string } | { ok: false; error: string };
/** A row action's result, tagged with the row so a refusal shows in that row's dialog. */
export type RowResult = FormResult & { rowId?: string };
type FormAction<S> = (prev: S, fd: FormData) => Promise<S>;

export const ACCESS_LABEL: Record<TokenScope, string> = { read: 'Read only', feedback: 'Read and feedback', manage: 'Read, feedback and manage' };
const selectClass = `${nativeSelectClass} w-full max-w-[240px]`;

/** Extra hidden inputs every form on the card carries (the client page sends its `clientId` for revalidation). */
type Hidden = Record<string, string>;
function HiddenFields({ fields }: { fields?: Hidden }) {
  return Object.entries(fields ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);
}

function Message({ state }: { state: FormResult }) {
  if (!state.ok && state.error) {
    return (
      <ErrorNote focusKey={state}>
        {state.error}
      </ErrorNote>
    );
  }
  if (state.ok && state.message) return <p className="rounded-md bg-muted-surface p-3 text-ink">{state.message}</p>;
  return null;
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard refused (permissions, insecure origin): the text stays selectable on the page.
        }
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

/**
 * 15a §2.10: the `claude mcp add` server name — a kebab slug of the agency's display name (ASCII letters and digits,
 * at most 48 characters), or `competitor-intel` when there is nothing to slug. Never the product name.
 */
export function mcpServerName(displayName: string | null): string {
  const slug = (displayName ?? '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');
  return slug || 'competitor-intel';
}

/** `displayName` is the viewer's agency (white-label) name, used only for the Claude Code command's server name. */
export function ConnectorUrlCard({ url, displayName, help }: { url: string; displayName: string | null; help?: ReactNode }) {
  return (
    <Section title="Connector URL" titleAside={help}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <code className="rounded-md bg-muted-surface px-3 py-2 font-mono text-sm text-ink" data-testid="connector-url">
            {url}
          </code>
          <CopyButton text={url} />
        </div>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-ink">
          <li>
            <strong>Claude</strong> (claude.ai or the desktop app): Settings → Connectors → Add custom connector. Paste the URL, then sign in and choose this workspace.
          </li>
          <li>
            <strong>ChatGPT</strong>: Settings → Connectors → Create (developer mode). Paste the URL and sign in.
          </li>
          <li>
            <strong>Claude Code</strong>: create a token below, then run{' '}
            <code className="break-all rounded bg-muted-surface px-1.5 py-0.5 font-mono text-sm">{`claude mcp add --transport http ${mcpServerName(displayName)} ${url} --header "Authorization: Bearer YOUR_TOKEN"`}</code>.
          </li>
        </ul>
      </div>
    </Section>
  );
}

function ShownOncePanel({ token, onDone }: { token: string; onDone: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-md bg-muted-surface p-4 text-ink" data-testid="new-token">
      <p className="font-semibold">Copy your token now. You won&apos;t be able to see it again.</p>
      <div className="flex flex-wrap items-center gap-3">
        <code className="break-all rounded-md bg-surface px-3 py-2 font-mono text-sm" data-testid="new-token-value">
          {token}
        </code>
        <CopyButton text={token} />
        <Button type="button" size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

function RevokeTokenButton({ item, action, pending, result, hidden }: { item: ApiTokenView; action: (fd: FormData) => void; pending: boolean; result: RowResult; hidden?: Hidden }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Revoke ${item.name}`}>
          Revoke
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke this token?</DialogTitle>
          <DialogDescription>Anything using it stops working straight away.</DialogDescription>
        </DialogHeader>
        {!result.ok && result.rowId === item.id && <Message state={result} />}
        <form action={action}>
          <HiddenFields fields={hidden} />
          <input type="hidden" name="tokenId" value={item.id} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={pending}>
              Revoke
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AccessTokensCard({ canCreate, scopes, tokens, showOwner, tz, createAction, revokeAction, note, hidden, help, empty }: {
  canCreate: boolean;
  scopes: TokenScope[];
  tokens: ApiTokenView[];
  showOwner: boolean;
  /** The viewer's time zone (the page passes `await viewerTimeZone()`). */
  tz: string;
  createAction: FormAction<CreateTokenResult>;
  revokeAction: FormAction<RowResult>;
  /** Shown instead of the create form (e.g. agency roles on a client page). */
  note?: ReactNode;
  hidden?: Hidden;
  /** Help tips shown beside the card title. */
  help?: ReactNode;
  /** Replaces the plain "No access tokens yet." line. */
  empty?: ReactNode;
}) {
  const readOnly = useReadOnly();
  const [created, create, creating] = useActionState(createAction, { ok: true } as CreateTokenResult);
  const [revoked, revoke, revoking] = useActionState(revokeAction, { ok: true } as RowResult);
  // Which created token was dismissed with Done; a later create (new id) shows its own token again.
  const [doneId, setDoneId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fresh = created.ok && created.token && created.id !== doneId ? created : null;
  useEffect(() => {
    if (created.ok && created.token) formRef.current?.reset();
  }, [created]);

  return (
    <Section title="Access tokens" titleAside={help}>
      <div className="flex flex-col gap-5">
        <p className="text-ink">For Claude Code, scripts and tools that can&apos;t sign in. A token acts as you, with the access level you choose.</p>
        {canCreate ? (
          readOnly ? null : (
          <form ref={formRef} action={create} className="flex flex-col gap-4">
            <HiddenFields fields={hidden} />
            {!created.ok && <Message state={created} />}
            <div className="flex flex-wrap items-end gap-4">
              <Field label="Name" className="w-72">
                <Input id="token-name" name="name" required maxLength={80} autoComplete="off" placeholder="e.g. Claude Code on my laptop" />
              </Field>
              <Field label="Access">
                <select id="token-scope" name="scope" className={selectClass} defaultValue={scopes[0]}>
                  {scopes.map((s) => (
                    <option key={s} value={s}>
                      {ACCESS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </Field>
              <Button type="submit" disabled={creating}>
                Create token
              </Button>
            </div>
          </form>
          )
        ) : (
          note
        )}
        {fresh && fresh.token && <ShownOncePanel token={fresh.token} onDone={() => setDoneId(fresh.id ?? null)} />}
        {revoked.ok && <Message state={revoked} />}
        {tokens.length === 0 ? (
          (empty ?? <p className="text-muted-ink">No access tokens yet.</p>)
        ) : (
          <TableFrame>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Access</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last used</TableHead>
                {showOwner && <TableHead>Owner</TableHead>}
                {!readOnly && (
                  <TableHead>
                    <span className="sr-only">Revoke</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.map((t) => (
                <TableRow key={t.id} data-testid="token-row">
                  <TableCell>
                    <span className="font-medium">{t.name}</span>
                    <span className="ml-2 font-mono text-xs text-muted-ink">{t.prefix}…</span>
                  </TableCell>
                  <TableCell>{ACCESS_LABEL[t.scope]}</TableCell>
                  <TableCell>{formatDate(t.createdAt, { tz })}</TableCell>
                  <TableCell>{t.lastUsedAt ? formatDate(t.lastUsedAt, { tz }) : 'Never'}</TableCell>
                  {showOwner && <TableCell>{t.ownerName ?? '—'}</TableCell>}
                  {!readOnly && (
                    <TableCell className="text-right">
                      <RevokeTokenButton item={t} action={revoke} pending={revoking} result={revoked} hidden={hidden} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </TableFrame>
        )}
      </div>
    </Section>
  );
}

function DisconnectButton({ item, action, pending, result, hidden }: { item: OAuthGrantView; action: (fd: FormData) => void; pending: boolean; result: RowResult; hidden?: Hidden }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Disconnect ${item.appName}`}>
          Disconnect
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disconnect {item.appName}?</DialogTitle>
          <DialogDescription>It loses access straight away and has to ask again next time.</DialogDescription>
        </DialogHeader>
        {!result.ok && result.rowId === item.id && <Message state={result} />}
        <form action={action}>
          <HiddenFields fields={hidden} />
          <input type="hidden" name="grantId" value={item.id} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={pending}>
              Disconnect
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ConnectedAppsCard({ grants, showOwner, tz, revokeAction, hidden, help, empty }: { grants: OAuthGrantView[]; showOwner: boolean; tz: string; revokeAction: FormAction<RowResult>; hidden?: Hidden; help?: ReactNode; empty?: ReactNode }) {
  const readOnly = useReadOnly();
  const [result, revoke, pending] = useActionState(revokeAction, { ok: true } as RowResult);
  return (
    <Section title="Connected apps" titleAside={help}>
      <div className="flex flex-col gap-5">
        <p className="text-ink">Apps you&apos;ve connected by signing in.</p>
        {result.ok && <Message state={result} />}
        {grants.length === 0 ? (
          (empty ?? <p className="text-muted-ink">No connected apps yet.</p>)
        ) : (
          <TableFrame>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>App</TableHead>
                <TableHead>Access</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Connected</TableHead>
                {showOwner && <TableHead>Owner</TableHead>}
                {!readOnly && (
                  <TableHead>
                    <span className="sr-only">Disconnect</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {grants.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">{g.appName}</TableCell>
                  <TableCell>{ACCESS_LABEL[g.scope]}</TableCell>
                  <TableCell>{g.clientName ?? 'All clients'}</TableCell>
                  <TableCell>{formatDate(g.connectedAt, { tz })}</TableCell>
                  {showOwner && <TableCell>{g.ownerName ?? '—'}</TableCell>}
                  {!readOnly && (
                    <TableCell className="text-right">
                      <DisconnectButton item={g} action={revoke} pending={pending} result={result} hidden={hidden} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </TableFrame>
        )}
      </div>
    </Section>
  );
}
