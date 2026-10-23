// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReadOnlyProvider } from './read-only';

// jsdom has no ResizeObserver; Radix Switch's thumb needs one to mount at all.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub;
}

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/app/(app)/agency/settings/slack-teams/actions', () => ({ addWebhookAction: vi.fn(), toggleWebhookAction: vi.fn() }));
vi.mock('@/app/(app)/agency/settings/team/actions', () => ({ inviteAction: vi.fn(), revokeInvitationAction: vi.fn(), revokeMembershipAction: vi.fn() }));
vi.mock('@/app/(app)/agency/approvals/[briefId]/actions', () => ({
  editItemAction: vi.fn(), dropItemAction: vi.fn(), moveItemAction: vi.fn(), rateItemAction: vi.fn(), approveAction: vi.fn(), sendNowAction: vi.fn(), autoSendAction: vi.fn(),
}));
vi.mock('@/app/(app)/agency/alerts/actions', () => ({ approveAlertAction: vi.fn(), dismissAlertAction: vi.fn() }));
vi.mock('@/app/(app)/c/[clientId]/settings/delivery/actions', () => ({ addRecipientAction: vi.fn(), deactivateRecipientAction: vi.fn(), saveDeliveryAction: vi.fn() }));
vi.mock('@/app/(app)/c/[clientId]/competitors/actions', () => ({
  requestSuggestionsAction: vi.fn(), acceptSuggestionsAction: vi.fn(), dismissSuggestionAction: vi.fn(), addCompetitorAction: vi.fn(), removeCompetitorAction: vi.fn(), searchStatusAction: vi.fn(),
}));

const { WebhookToggle, AddWebhookForm } = await import('@/app/(app)/agency/settings/slack-teams/webhook-controls');
const { InviteForm, RemoveMemberButton } = await import('@/app/(app)/agency/settings/team/invite-form');
const { AddRecipientForm, DeactivateRecipientButton, DeliveryForm } = await import('@/app/(app)/c/[clientId]/settings/delivery/delivery-controls');
const { AddCompetitorForm, SuggestionsPanel, TrackedCompetitorsTable } = await import('@/app/(app)/c/[clientId]/competitors/competitor-controls');
const { ReviewItem, ReviewFooter } = await import('@/app/(app)/agency/approvals/[briefId]/review-controls');
const { AlertList } = await import('@/app/(app)/agency/alerts/alert-controls');
const { RecommendationBoard } = await import('./recommendation-board');

const inReadOnly = (el: ReactElement) => render(<ReadOnlyProvider readOnly>{el}</ReadOnlyProvider>);
const inWritable = (el: ReactElement) => render(<ReadOnlyProvider readOnly={false}>{el}</ReadOnlyProvider>);

afterEach(() => {
  document.body.innerHTML = '';
});

describe('write controls hide in a support session', () => {
  it('webhook enable switch: a plain On/Off label, no switch', () => {
    inWritable(<WebhookToggle id="w1" active label="Slack webhook active" />);
    expect(screen.getByRole('switch')).toBeTruthy();
    document.body.innerHTML = '';
    inReadOnly(<WebhookToggle id="w1" active label="Slack webhook active" />);
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByText('On')).toBeTruthy();
  });

  it('webhook add form is absent', () => {
    const { container } = inReadOnly(<AddWebhookForm />);
    expect(container.querySelector('form')).toBeNull();
  });

  it('team invite form and the remove/revoke buttons are absent, links stay', () => {
    const { container } = inReadOnly(
      <>
        <InviteForm clients={[{ id: 'c1', name: 'Lone Star Air' }]} canInviteAgencyRoles />
        <RemoveMemberButton membershipId="m1" name="Ana" />
        <a href="/agency/settings/team?x=1">Older</a>
      </>,
    );
    expect(container.querySelector('form')).toBeNull();
    expect(screen.queryByRole('button', { name: /invite|remove/i })).toBeNull();
    expect(screen.getByRole('link', { name: 'Older' })).toBeTruthy();
  });

  it('delivery recipients add and deactivate are absent; the delivery form keeps its values but loses Save', () => {
    inWritable(<AddRecipientForm clientId="c1" />);
    expect(screen.getByRole('button', { name: 'Add recipient' })).toBeTruthy();
    document.body.innerHTML = '';
    const { container } = inReadOnly(
      <>
        <AddRecipientForm clientId="c1" />
        <DeactivateRecipientButton clientId="c1" contactId="k1" email="a@b.co" />
        <DeliveryForm clientId="c1" alertMode="direct" briefAutoSend={false} timezone="UTC" timezoneOptions={['UTC']} />
        <a href="/c/c1/settings/alerts">Alert rules</a>
      </>,
    );
    expect(screen.queryByRole('button', { name: /add recipient|deactivate|^save$/i })).toBeNull();
    expect(container.querySelector('fieldset[disabled]')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Alert rules' })).toBeTruthy();
  });

  it('recommendation status controls are absent; the card and its evidence link stay', () => {
    const rec = {
      id: 'a', title: 'Rec a', rationale: 'because', effort: 'L', impact: 'H', owner: 'client', status: 'todo', dismissReason: null, dueAt: null,
      source: 'brief', evidenceIds: ['e1'], upsellTag: null, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z',
    } as never;
    inWritable(<RecommendationBoard action={vi.fn()} clientId="c1" agency canEdit items={[rec]} />);
    expect(screen.getByRole('button', { name: 'Start Rec a' })).toBeTruthy();
    document.body.innerHTML = '';
    inReadOnly(<RecommendationBoard action={vi.fn()} clientId="c1" agency canEdit items={[rec]} />);
    expect(screen.getByText('Rec a')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /start|done|dismiss|reopen/i })).toBeNull();
    expect(screen.getByRole('link', { name: 'Evidence 1' }).getAttribute('href')).toBe('/c/c1/evidence/e1');
  });

  it('brief approve, send now, auto-send, edit, remove, move and rate are absent; the evidence link stays', () => {
    const item = { id: 'i1', ord: 1, competitorId: 'c', competitorName: 'Smith HVAC', headline: 'Smith cut prices', whatChanged: 'w', whyItMatters: 'y', recommendedAction: 'r', confidence: 0.9, effort: 'L', impact: 'H', evidenceIds: ['e1'], status: 'active', upsellTag: null } as never;
    const { container } = inReadOnly(
      <>
        <ReviewItem briefId="b1" clientId="c1" item={item} editable first last />
        <ReviewFooter briefId="b1" clientId="c1" status="ready" autoSend={false} sendTime="Monday 7:00 AM CT" />
      </>,
    );
    expect(screen.getByText('Smith cut prices')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(container.querySelector('form')).toBeNull();
    expect(screen.getByRole('link', { name: 'Evidence 1' }).getAttribute('href')).toBe('/c/c1/evidence/e1');
  });

  it('competitor add and remove are absent; the competitor link stays and no empty column header is left', () => {
    const items = [{ id: 'k1', name: 'Peachtree Air', domain: 'peachtreeair.com', activePages: 3, addedAt: '2026-10-01T00:00:00Z' }] as never;
    const { container } = inReadOnly(
      <>
        <TrackedCompetitorsTable clientId="c1" items={items} canRemove />
        <AddCompetitorForm clientId="c1" atLimit={false} limit={5} />
      </>,
    );
    expect(screen.getByRole('link', { name: 'Peachtree Air' }).getAttribute('href')).toBe('/c/c1/competitors/k1');
    expect(screen.queryByRole('button', { name: /remove|add competitor/i })).toBeNull();
    expect(container.querySelector('form')).toBeNull();
    expect(container.querySelectorAll('th').length).toBe(5);
  });

  it('the alert Dismiss confirm trigger and its Approve button are hidden in read-only', () => {
    const alert = { id: 'al1', clientName: 'Lone Star Air', competitorName: 'Peachtree', score: 80, headline: 'Price drop', body: 'b', evidenceCount: 2, written: 'llm', status: 'pending_review', heldForDigest: false, createdAt: '2026-10-20T10:00:00.000Z' } as never;
    inWritable(<AlertList items={[alert]} assistantName="Friday" />);
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
    document.body.innerHTML = '';
    inReadOnly(<AlertList items={[alert]} assistantName="Friday" />);
    expect(screen.getByText('Price drop')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /dismiss|approve/i })).toBeNull();
  });
  it('suggestions panel stays and lists suggestions, but search, Track selected and Dismiss are absent', () => {
    const s = [{ id: 's1', name: 'Peachtree Air', domain: 'peachtreeair.com', placeId: 'p', rating: 4.6, votes: 120, appearances: 7, bestRank: 2, overlapScore: 0.82, tier: 'top', category: null, distanceKm: null, signals: { rating: null, votes: null, reviews30d: null, reviews90d: null, replyRate: null, googleAdsActive: null, googleAdsNew30d: null, googleAccount: null, metaPage: null, metaAdsActive: null, claimed: null, chain: null, categoryMatch: null, distanceKm: null, presence: null }, adMatches: [], preselected: true }] as never;
    inWritable(<SuggestionsPanel clientId="c1" ready suggestions={s} atLimit={false} canSearch />);
    expect(screen.getByRole('button', { name: /track selected/i })).toBeTruthy();
    document.body.innerHTML = '';
    const { container } = inReadOnly(<SuggestionsPanel clientId="c1" ready suggestions={s} atLimit={false} canSearch />);
    expect(screen.getByText('Peachtree Air')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('form')).toBeNull();
  });
});
