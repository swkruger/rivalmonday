'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@cs/ui';
import { LayoutDashboard, Mail, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { CLIENT_VIEW } from '../../../content/client-view';
import { SECTIONS } from '../../../content/home';
import { SAMPLE } from '../../sample/schema';
import { HomeSectionShell, SectionHeading } from '../home/section-heading';
import { Reveal } from '../motion/in-view';
import { BriefEmailMock } from './brief-email-mock';
import { DashboardMock } from './dashboard-mock';
import { FridayChatMock } from './friday-chat-mock';

const TABS = [
  { value: 'dashboard', label: CLIENT_VIEW.tabs.dashboard, Icon: LayoutDashboard, bar: `Overview · ${SAMPLE.business.name}` },
  { value: 'brief', label: CLIENT_VIEW.tabs.brief, Icon: Mail, bar: 'Inbox' },
  { value: 'friday', label: CLIENT_VIEW.tabs.friday, Icon: MessageSquare, bar: `Ask Friday · ${SAMPLE.business.name}` },
] as const;
type Tab = (typeof TABS)[number]['value'];

/**
 * "What your clients see": the client's dashboard, Monday brief email and Friday, as one tabbed window built from
 * the sample data (no screenshots, so it stays in step with the sample brief). Agency branding is shown as slots.
 */
export function ClientView() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const bar = TABS.find((t) => t.value === tab)!.bar;
  return (
    <HomeSectionShell id="client-view" labelledBy="client-view-heading" className="border-y border-line bg-canvas py-16 lg:py-24">
      <SectionHeading section={SECTIONS['client-view']} />
      <Reveal className="mt-10">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-4">
          <TabsList aria-label="Client view" className="self-start">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="press gap-1.5">
                <t.Icon aria-hidden="true" className="size-4" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-float">
            <div aria-hidden="true" className="flex items-center gap-3 border-b border-line bg-muted-surface px-3 py-2">
              <span className="flex gap-1.5">
                <span className="size-2.5 rounded-full bg-line-control" />
                <span className="size-2.5 rounded-full bg-line-control" />
                <span className="size-2.5 rounded-full bg-line-control" />
              </span>
              <span className="min-w-0 flex-1 truncate rounded-sm bg-surface px-3 py-1 text-center text-xs text-ink-secondary">{bar}</span>
              <span className="w-10" />
            </div>
            {/* Mounted once each, so a tab keeps its drawn charts when you come back to it. */}
            <TabsContent value="dashboard" forceMount className="data-[state=inactive]:hidden">
              <DashboardMock />
            </TabsContent>
            <TabsContent value="brief" forceMount className="data-[state=inactive]:hidden">
              <BriefEmailMock />
            </TabsContent>
            <TabsContent value="friday" forceMount className="data-[state=inactive]:hidden">
              <FridayChatMock />
            </TabsContent>
          </div>
          {/* What to notice on the open tab; numbered so the eye can walk the window. */}
          <ol key={tab} aria-label="What to notice" className="mt-2 grid gap-4 sm:grid-cols-3 sm:gap-6">
            {CLIENT_VIEW.notes[tab].map((n, i) => (
              <li key={n.title} className="reveal-quick flex gap-3" style={{ animationDelay: `${i * 80}ms` }}>
                <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-surface">{i + 1}</span>
                <span className="min-w-0 text-sm">
                  <span className="block font-semibold text-ink">{n.title}</span>
                  <span className="text-ink-secondary">{n.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </Tabs>
      </Reveal>
    </HomeSectionShell>
  );
}
