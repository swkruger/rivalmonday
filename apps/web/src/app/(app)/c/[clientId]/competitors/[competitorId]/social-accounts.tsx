import { formatCount, formatDate } from '@/lib/format';
import { labelFor, SOCIAL_STATUS } from '@/lib/labels';
import type { SocialAccountsView, SocialActivityView } from '@cs/tools';
import { Section, StatusChip } from '@cs/ui';
import { FindAndAdd, SuggestedActions } from './social-controls';

type Network = 'facebook' | 'instagram';
const NETWORK: Record<Network, string> = { facebook: 'Facebook', instagram: 'Instagram' };
/** Section copy (draft → copy review). */
export const SOCIAL_EMPTY = 'No Facebook or Instagram account found yet.';

type Active = SocialActivityView['businesses'][number]['accounts'][number];
type Listed = SocialAccountsView['accounts'][number];

/**
 * The "Social accounts" block of the competitor page. Everyone sees the confirmed accounts (from `get_social_activity`);
 * agency roles also see suggested accounts with "Confirm" / "Not them", "Not them" on confirmed accounts and the find / add-link controls (`list_social_accounts`).
 */
export function SocialAccountsSection({ clientId, competitorId, activity, listed, agency, tz }: {
  clientId: string;
  competitorId: string;
  activity: Active[];
  /** Null for client roles (and a refused read): confirmed accounts only. */
  listed: Listed[] | null;
  agency: boolean;
  tz: string;
}) {
  const rows = (['facebook', 'instagram'] as const).flatMap((network) => {
    const confirmed = activity.find((a) => a.network === network);
    const suggested = agency ? (listed ?? []).filter((a) => a.network === network && a.status === 'suggested') : [];
    // The confirmed row's id (agency only) lets the agency reject a wrong confirmed account.
    const confirmedId = agency ? ((listed ?? []).find((a) => a.network === network && a.status === 'confirmed')?.id ?? null) : null;
    return [
      ...(confirmed ? [{ key: `c:${network}`, network, status: 'confirmed' as const, handle: confirmed.handle, url: confirmed.url, followers: confirmed.followers, lastPostAt: confirmed.lastPostAt, accountId: confirmedId }] : []),
      ...suggested.map((a) => ({ key: a.id, network, status: 'suggested' as const, handle: a.handle, url: a.url, followers: a.followers, lastPostAt: null as string | null, accountId: a.id })),
    ];
  });
  return (
    <Section title="Social accounts">
      <div className="flex flex-col gap-4">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-ink">{SOCIAL_EMPTY}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col divide-y divide-line border-y border-line p-0" aria-label="Social accounts">
            {rows.map((r) => {
              const status = labelFor(SOCIAL_STATUS, r.status);
              return (
                <li key={r.key} className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
                  <div className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
                    <span className="text-13 text-muted-ink">{NETWORK[r.network]}</span>
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="truncate font-semibold text-link">@{r.handle}</a>
                  </div>
                  <dl className="m-0 flex gap-6 text-sm">
                    <div>
                      <dt className="text-13 text-muted-ink">Followers</dt>
                      <dd className="m-0 text-ink">{r.followers === null ? '—' : formatCount(r.followers)}</dd>
                    </div>
                    <div>
                      <dt className="text-13 text-muted-ink">Last post</dt>
                      <dd className="m-0 text-ink">{r.status === 'suggested' ? '—' : r.lastPostAt ? formatDate(r.lastPostAt, { tz }) : 'No recent post'}</dd>
                    </div>
                  </dl>
                  <StatusChip tone={status.tone}>{status.label}</StatusChip>
                  {r.accountId && agency && <SuggestedActions clientId={clientId} competitorId={competitorId} accountId={r.accountId} handle={r.handle} confirmed={r.status === 'confirmed'} />}
                </li>
              );
            })}
          </ul>
        )}
        {agency && <FindAndAdd clientId={clientId} competitorId={competitorId} />}
      </div>
    </Section>
  );
}
