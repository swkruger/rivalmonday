'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@cs/ui';
import { LayoutDashboard, Mail, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { CLIENT_VIEW, type DashboardView } from '../../../content/client-view';
import { SECTIONS } from '../../../content/home';
import { SAMPLE } from '../../sample/schema';
import { HomeSectionShell, SectionHeading } from '../home/section-heading';
import { BriefEmailMock } from './brief-email-mock';
import { DashboardMock } from './dashboard-mock';
import { FridayChatMock } from './friday-chat-mock';

const TABS = [
  { value: 'dashboard', label: CLIENT_VIEW.tabs.dashboard, Icon: LayoutDashboard, bar: SAMPLE.business.name },
  { value: 'brief', label: CLIENT_VIEW.tabs.brief, Icon: Mail, bar: 'Inbox' },
  { value: 'friday', label: CLIENT_VIEW.tabs.friday, Icon: MessageSquare, bar: `Ask Friday · ${SAMPLE.business.name}` },
] as const;
type Tab = (typeof TABS)[number]['value'];

/**
 * "What your clients see": the client's dashboard, Monday brief email and Friday, as one tabbed window built from
 * the sample data (no screenshots, so it stays in step with the sample brief). Agency branding is shown as slots.
 */
export function ClientView({ heading }: { heading?: string } = {}) {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [view, setView] = useState<DashboardView>('overview');
  const page = CLIENT_VIEW.nav.find((n) => n.id === view)!.label;
  const bar = tab === 'dashboard' ? `${page} · ${SAMPLE.business.name}` : TABS.find((t) => t.value === tab)!.bar;
  return (
    <HomeSectionShell id="client-view" labelledBy="client-view-heading" className="border-y border-line bg-canvas py-20 lg:py-28">
      <SectionHeading section={heading ? { ...SECTIONS['client-view'], heading } : SECTIONS['client-view']} />
      <div className="mt-10">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-4">
          <TabsList aria-label="Client view" className="seg-tabs self-start">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="press gap-1.5">
                <t.Icon aria-hidden="true" className="size-4" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="product-frame border border-line bg-surface">
            <div aria-hidden="true" className="frame-chrome">
              <span className="flex gap-2">
                <span className="frame-chrome-dot" />
                <span className="frame-chrome-dot" />
                <span className="frame-chrome-dot" />
              </span>
              <span className="flex min-w-0 flex-1 justify-center">
                <span className="min-w-0 truncate rounded-md bg-muted-surface px-4 py-1.5 text-13 text-ink-secondary">{bar}</span>
              </span>
              <span className="w-12" />
            </div>
            {/* Mounted once each, so a tab keeps its drawn charts when you come back to it. */}
            <TabsContent value="dashboard" forceMount className="data-[state=inactive]:hidden">
              <DashboardMock view={view} onView={setView} onAskFriday={() => setTab('friday')} />
            </TabsContent>
            <TabsContent value="brief" forceMount className="data-[state=inactive]:hidden">
              <BriefEmailMock />
            </TabsContent>
            <TabsContent value="friday" forceMount className="data-[state=inactive]:hidden">
              <FridayChatMock />
            </TabsContent>
          </div>
          {tab === 'dashboard' && view !== 'overview' ? (
            <p key={view} className="reveal-quick mt-2 text-sm text-ink-secondary">{CLIENT_VIEW.viewNotes[view]}</p>
          ) : (
            /* What to notice on the open tab; numbered so the eye can walk the window. */
            <ol key={tab} aria-label="What to notice" className="mt-2 grid gap-4 sm:grid-cols-3 sm:gap-6">
              {CLIENT_VIEW.notes[tab].map((n, i) => (
                <li key={n.title} className="reveal-quick flex gap-3" style={{ animationDelay: `${i * 80}ms` }}>
                  <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber text-sm font-bold tabular-nums text-amber-text">{i + 1}</span>
                  <span className="min-w-0 text-sm">
                    <span className="block font-semibold text-ink">{n.title}</span>
                    <span className="text-ink-secondary">{n.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Tabs>
      </div>
    </HomeSectionShell>
  );
}
