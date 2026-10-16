import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Phase 8b g10: every component or page under `(app)` that imports a server-action module must reference
 * `WriteGuard` / `useReadOnly`, or be listed here with the reason it is exempt. A new file that wires an action
 * without a guard fails this test, so the author has to decide (guard it, or justify it in the allow-list).
 */
const SRC = fileURLToPath(new URL('..', import.meta.url));

const EXEMPT: Record<string, string> = {
  // The action is passed as a prop to a component that guards itself.
  'app/(app)/agency/ai/page.tsx': 'passes actions to AccessTokensCard/ConnectedAppsCard, which use useReadOnly',
  'app/(app)/c/[clientId]/settings/ai/page.tsx': 'same: ai-connections cards guard themselves',
  'app/(app)/agency/playbooks/page.tsx': 'PlaybookEditor falls back to its read-only view via useReadOnly',
  'app/(app)/agency/clients/new/page.tsx': 'ClientProfileForm guards its submit',
  'app/(app)/agency/branding/branding-form.tsx': 'passes the action to BrandingEditor, which guards its submit with WriteGuard',
  'app/(app)/onboarding/steps/branding.tsx': 'passes the action to BrandingEditor, which guards its submit with WriteGuard',
  'app/(app)/agency/prospects/new/page.tsx': 'ClientProfileForm guards its submit',
  'app/(app)/c/[clientId]/recommendations/page.tsx': 'RecommendationBoard guards itself',
  'app/(app)/c/[clientId]/changes/viewer.tsx': 'FeedbackButtons guards itself',
  'app/(app)/c/[clientId]/settings/alerts/page.tsx': 'AlertRulesForm guards itself',
  'app/(app)/c/[clientId]/settings/profile/page.tsx': 'ClientProfileForm and ClientFeaturesForm guard themselves',
  'app/(app)/c/[clientId]/evidence/[evidenceId]/page.tsx': 'SaveRecommendationDialog returns null via useReadOnly',
  // Not write tools, or unreachable in a support session.
  'components/sign-out-button.tsx': 'sign-out only; no write tool',
  'components/shell/guest-sign-out-button.tsx': 'guest sign-out only; no write tool',
  'app/(app)/c/[clientId]/ask/ask-screen.tsx': 'a support viewer gets supportAskView (no Ask UI) before any action is wired',
  'app/(app)/inbox/page.tsx': '404 in a support session (ctx.support)',
  'app/(app)/settings/notifications/contact-form.tsx': 'page is a 404 in a support session',
  'app/(app)/settings/notifications/pref-switch.tsx': 'page is a 404 in a support session',
  'app/(app)/agency/settings/platform-access/notify-switch.tsx': 'page is a 404 in a support session (viewer.kind !== user)',
  'app/(app)/agency/settings/billing/page.tsx': 'page is a 404 in a support session (viewer.kind !== user); its buttons guard themselves with useReadOnly',
  'app/(app)/agency/settings/billing/client-billing/section.tsx': 'only passes connectAction to PaymentButton, which guards itself with useReadOnly; the page is a 404 in a support session',
  'app/(app)/c/[clientId]/settings/billing/page.tsx': 'client-owner only (a support viewer is an agency role, so the page is a 404); Manage payment is PaymentButton, which guards itself with useReadOnly',
  'components/shell/membership-switcher.tsx': 'switchMembership sets a cookie, no write tool; not rendered for support viewers',
  'components/kb/article-sheet.tsx': 'loadKbArticle is a read',
};

const ACTION_IMPORT = /from\s+'(?:\.{1,2}\/)+(?:[\w[\]-]+\/)*actions'|from\s+'@\/app\/[^']*actions'|from\s+'@\/server\/[^']*action[^']*'/;
const GUARD = /\bWriteGuard\b|\buseReadOnly\b/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

/**
 * Client components that run an action themselves (`useActionState(`, or an `action`-typed prop, or an actions import)
 * must guard themselves, because their callers differ. Removing `useReadOnly` from a self-guarding component fails here.
 */
const CLIENT_EXEMPT: Record<string, string> = {
  'app/(app)/agency/branding/branding-form.tsx': 'passes the action to BrandingEditor, which guards its submit with WriteGuard',
  'app/(app)/onboarding/steps/branding.tsx': 'passes the action to BrandingEditor, which guards its submit with WriteGuard',
  'app/(app)/settings/notifications/contact-form.tsx': 'page is a 404 in a support session',
  'app/(app)/settings/notifications/pref-switch.tsx': 'page is a 404 in a support session',
  'app/(app)/agency/settings/platform-access/notify-switch.tsx': 'page is a 404 in a support session (viewer.kind !== user)',
  'components/ask/thread-list.tsx': 'Ask UI is never rendered in a support session (supportAskView)',
  'components/ask/ask-chat.tsx': 'Ask UI is never rendered in a support session (supportAskView)',
  'components/ask/confirm-card.tsx': 'Ask UI is never rendered in a support session (supportAskView)',
  'components/sign-out-button.tsx': 'sign-out only; no write tool',
  'components/shell/guest-sign-out-button.tsx': 'guest sign-out only; no write tool',
  'components/kb/article-sheet.tsx': 'loadKbArticle is a read',
};
const CLIENT_ACTION = /useActionState\(|\b\w*[aA]ction\??:\s*(?:\(|FormAction|RowAction|SetStatusAction|SaveRecommendationAction|[A-Z]\w*Action\b)/;

describe('write controls are guarded', () => {
  it('every client component that runs an action references useReadOnly or WriteGuard, or is on the reasoned allow-list', () => {
    const files = [...walk(join(SRC, 'app', '(app)')), ...walk(join(SRC, 'components'))].map((p) => ({
      rel: relative(SRC, p).split(sep).join('/'),
      text: readFileSync(p, 'utf8'),
    }));
    const clients = files.filter((f) => /^\s*(['"])use client\1/.test(f.text) && (CLIENT_ACTION.test(f.text) || ACTION_IMPORT.test(f.text)));
    const offenders = clients.filter((f) => !GUARD.test(f.text) && !(f.rel in CLIENT_EXEMPT)).map((f) => f.rel);
    expect(offenders).toEqual([]);
    const stale = Object.keys(CLIENT_EXEMPT).filter((rel) => {
      const f = files.find((x) => x.rel === rel);
      return !f || GUARD.test(f.text) || !/^\s*(['"])use client\1/.test(f.text);
    });
    expect(stale).toEqual([]);
  });

  const files = [...walk(join(SRC, 'app', '(app)')), ...walk(join(SRC, 'components'))].map((p) => ({
    rel: relative(SRC, p).split(sep).join('/'),
    text: readFileSync(p, 'utf8'),
  }));

  it('every file that imports a server action references WriteGuard or useReadOnly, or is on the reasoned allow-list', () => {
    const offenders = files.filter((f) => ACTION_IMPORT.test(f.text) && !GUARD.test(f.text) && !(f.rel in EXEMPT)).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('the allow-list has no stale entries (each exempt file still exists, imports an action and lacks a guard)', () => {
    const byRel = new Map(files.map((f) => [f.rel, f.text]));
    const stale = Object.keys(EXEMPT).filter((rel) => {
      const text = byRel.get(rel);
      return text === undefined || !ACTION_IMPORT.test(text) || GUARD.test(text);
    });
    expect(stale).toEqual([]);
  });
});
