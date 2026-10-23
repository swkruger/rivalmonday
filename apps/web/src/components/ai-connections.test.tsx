// @vitest-environment jsdom
import type { ApiTokenView, OAuthGrantView } from '@cs/tools';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Each `useActionState` call returns the state registered for its action (else the initial state). */
const states = new Map<unknown, unknown>();
vi.mock('react', async (orig) => ({
  ...(await orig<typeof import('react')>()),
  useActionState: (fn: unknown, init: unknown) => [states.has(fn) ? states.get(fn) : init, vi.fn(), false],
}));
const { AccessTokensCard, ConnectedAppsCard, ConnectorUrlCard, mcpServerName } = await import('./ai-connections');

const TOKEN = `rm_pat_${'a'.repeat(43)}`;
const token = (over: Partial<ApiTokenView> = {}): ApiTokenView => ({
  id: '11111111-1111-4111-8111-111111111111', name: 'Claude Code on my laptop', prefix: 'rm_pat_abcde', scope: 'read', clientId: null, clientName: null,
  ownerUserId: 'u1', ownerName: 'Ana Admin', createdAt: '2026-10-01T10:00:00.000Z', lastUsedAt: null, mine: true, ...over,
});
const grant = (over: Partial<OAuthGrantView> = {}): OAuthGrantView => ({
  id: '22222222-2222-4222-8222-222222222222', appName: 'Claude', scope: 'feedback', clientId: 'c1', clientName: 'Lone Star Air', ownerName: 'Olive Owner',
  connectedAt: '2026-10-02T10:00:00.000Z', mine: true, ...over,
});
const createAction = vi.fn();
const revokeTokenAction = vi.fn();
const revokeGrantAction = vi.fn();

beforeEach(() => states.clear());

describe('ConnectorUrlCard', () => {
  it('shows the connector URL, the setup bullets with the URL, and copies it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { container } = render(<ConnectorUrlCard url="https://app.example/mcp" displayName="Cool Comfort Marketing" />);
    expect(screen.getByText('Connector URL')).toBeTruthy();
    expect(screen.getByText('https://app.example/mcp')).toBeTruthy();
    expect(screen.getByText(/Settings → Connectors → Add custom connector/)).toBeTruthy();
    expect(screen.getByText(/claude mcp add --transport http cool-comfort-marketing https:\/\/app\.example\/mcp --header "Authorization: Bearer YOUR_TOKEN"/)).toBeTruthy();
    expect(container.textContent).not.toMatch(/rival[\s-]*monday/i);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy' })));
    expect(writeText).toHaveBeenCalledWith('https://app.example/mcp');
  });
});

describe('mcpServerName (15a §2.10)', () => {
  it.each([
    ['Cool Comfort', 'cool-comfort'],
    ['  Acme & Sons, LLC.  ', 'acme-sons-llc'],
    ['Café Crème Média', 'cafe-creme-media'],
    ['ABC---Marketing__2026', 'abc-marketing-2026'],
    ['A'.repeat(80), 'a'.repeat(48)],
  ])('%j → %s', (name, slug) => expect(mcpServerName(name)).toBe(slug));

  it.each([[null], [''], ['   '], ['!!!'], ['日本']])('%j has nothing to slug → competitor-intel', (name) => expect(mcpServerName(name)).toBe('competitor-intel'));

  it('no agency falls back to the neutral name in the command', () => {
    render(<ConnectorUrlCard url="https://app.example/mcp" displayName={null} />);
    expect(screen.getByText(/claude mcp add --transport http competitor-intel https:/)).toBeTruthy();
  });
});

describe('AccessTokensCard', () => {
  it('offers only the grantable access levels and the decided field copy', () => {
    render(<AccessTokensCard tz="UTC" canCreate scopes={['read', 'feedback']} tokens={[]} showOwner={false} createAction={createAction} revokeAction={revokeTokenAction} />);
    const access = screen.getByLabelText('Access') as HTMLSelectElement;
    expect(Array.from(access.options).map((o) => o.textContent)).toEqual(['Read only', 'Read and feedback']);
    expect((screen.getByLabelText('Name') as HTMLInputElement).placeholder).toBe('e.g. Claude Code on my laptop');
    expect(screen.getByRole('button', { name: 'Create token' })).toBeTruthy();
    expect(screen.getByText('No access tokens yet.')).toBeTruthy();
  });

  it('hides the create form when the viewer cannot create tokens here', () => {
    render(<AccessTokensCard tz="UTC" canCreate={false} scopes={[]} tokens={[]} showOwner={false} createAction={createAction} revokeAction={revokeTokenAction} />);
    expect(screen.queryByRole('button', { name: 'Create token' })).toBeNull();
  });

  it('shows a new token once, with a copy button, until Done', async () => {
    states.set(createAction, { ok: true, id: 't1', token: TOKEN, prefix: TOKEN.slice(0, 12) });
    render(<AccessTokensCard tz="UTC" canCreate scopes={['read']} tokens={[token()]} showOwner={false} createAction={createAction} revokeAction={revokeTokenAction} />);
    expect(screen.getByText("Copy your token now. You won't be able to see it again.")).toBeTruthy();
    expect(screen.getByText(TOKEN)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Copy' })).toHaveLength(1);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Done' })));
    expect(screen.queryByText(TOKEN)).toBeNull();
  });

  it('lists tokens with access, dates and "Never" for unused ones; Owner only for admins', () => {
    const { unmount } = render(
      <AccessTokensCard tz="UTC" canCreate={false} scopes={[]} showOwner={false} createAction={createAction} revokeAction={revokeTokenAction}
        tokens={[token(), token({ id: '33333333-3333-4333-8333-333333333333', name: 'Script', scope: 'manage', lastUsedAt: '2026-10-05T08:00:00.000Z' })]} />,
    );
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]!).getByText('Claude Code on my laptop')).toBeTruthy();
    expect(within(rows[1]!).getByText('Read only')).toBeTruthy();
    expect(within(rows[1]!).getByText('Oct 1')).toBeTruthy();
    expect(within(rows[1]!).getByText('Never')).toBeTruthy();
    expect(within(rows[2]!).getByText('Read, feedback and manage')).toBeTruthy();
    expect(within(rows[2]!).getByText('Oct 5')).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Owner' })).toBeNull();
    unmount();
    render(<AccessTokensCard tz="UTC" canCreate={false} scopes={[]} showOwner tokens={[token()]} createAction={createAction} revokeAction={revokeTokenAction} />);
    expect(screen.getByRole('columnheader', { name: 'Owner' })).toBeTruthy();
    expect(screen.getByText('Ana Admin')).toBeTruthy();
  });

  it('asks before revoking', async () => {
    render(<AccessTokensCard tz="UTC" canCreate={false} scopes={[]} showOwner={false} tokens={[token()]} createAction={createAction} revokeAction={revokeTokenAction} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Revoke Claude Code on my laptop' })));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Revoke this token?')).toBeTruthy();
    expect(within(dialog).getByText('Anything using it stops working straight away.')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Revoke' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });
});

describe('ConnectedAppsCard', () => {
  it('shows the empty state', () => {
    render(<ConnectedAppsCard tz="UTC" grants={[]} showOwner={false} revokeAction={revokeGrantAction} />);
    expect(screen.getByText("Apps you've connected by signing in.")).toBeTruthy();
    expect(screen.getByText('No connected apps yet.')).toBeTruthy();
  });

  it('lists apps with workspace and asks before disconnecting', async () => {
    render(<ConnectedAppsCard tz="UTC" grants={[grant(), grant({ id: '44444444-4444-4444-8444-444444444444', appName: 'ChatGPT', clientId: null, clientName: null })]} showOwner revokeAction={revokeGrantAction} />);
    expect(screen.getByRole('columnheader', { name: 'Owner' })).toBeTruthy();
    expect(screen.getByText('Lone Star Air')).toBeTruthy();
    expect(screen.getByText('All clients')).toBeTruthy();
    expect(screen.getAllByText('Read and feedback')).toHaveLength(2);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Disconnect Claude' })));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Disconnect Claude?')).toBeTruthy();
    expect(within(dialog).getByText('It loses access straight away and has to ask again next time.')).toBeTruthy();
  });
});
