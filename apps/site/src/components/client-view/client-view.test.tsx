import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CLIENT_VIEW, type DashboardOpen } from '../../../content/client-view';
import { FRIDAY_ANSWERS } from '../../../content/sample-friday';
import { SAMPLE } from '../../sample/schema';
import { ClientView } from './client-view';

/** Panels stay mounted (charts keep their drawn state); each is named by its tab. */
const panel = (name = 'Dashboard') => screen.getByRole('tabpanel', { name });

describe('ClientView', () => {
  it('opens on the dashboard with the KPIs, pressure and alerts from the sample', () => {
    render(<ClientView />);
    expect(screen.getByRole('heading', { name: 'A dashboard, a Monday brief and an assistant, all under your brand.' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Dashboard' }).getAttribute('aria-selected')).toBe('true');
    for (const k of CLIENT_VIEW.kpis) expect(within(panel()).getByText(k.label)).toBeTruthy();
    for (const p of CLIENT_VIEW.pressure) expect(within(panel()).getByRole('img', { name: `Competitive pressure ${p.score} of 100, ${p.level}` })).toBeTruthy();
    for (const a of CLIENT_VIEW.alerts) expect(within(panel()).getByText(a.title)).toBeTruthy();
    expect(within(panel()).getByRole('img', { name: /Active competitor ads per week/ })).toBeTruthy();
  });

  it('the ad chart has a table view with one row per week', () => {
    render(<ClientView />);
    const table = within(panel()).getByRole('table', { name: 'Active competitor ads per week' });
    expect(within(table).getAllByRole('row')).toHaveLength(SAMPLE.rankGrid.weeks.length + 1);
  });

  it('the menu switches pages, the window title follows, and the notes step aside off the overview', () => {
    render(<ClientView />);
    const menu = within(panel()).getByRole('navigation', { name: 'Client menu (sample)' });
    expect(within(menu).getByRole('button', { name: 'Overview' }).getAttribute('aria-current')).toBe('page');
    for (const { id, label } of CLIENT_VIEW.nav) {
      fireEvent.click(within(menu).getByRole('button', { name: label }));
      expect(within(menu).getByRole('button', { name: label }).getAttribute('aria-current')).toBe('page');
      expect(screen.getByText(`${label} · ${SAMPLE.business.name}`)).toBeTruthy();
      if (id === 'overview') expect(screen.getByRole('list', { name: 'What to notice' })).toBeTruthy();
      else {
        expect(screen.queryByRole('list', { name: 'What to notice' })).toBeNull();
        expect(screen.getByText(CLIENT_VIEW.viewNotes[id])).toBeTruthy();
        expect(within(panel()).getAllByText(label).length).toBeGreaterThan(1);
      }
    }
  });

  it('every number, rival and alert leads to a real page or evidence sheet', () => {
    const targets: DashboardOpen[] = [...CLIENT_VIEW.kpis, ...CLIENT_VIEW.pressure].map((x) => x.open);
    for (const t of targets) {
      if ('evidence' in t) expect(SAMPLE.evidence[t.evidence], t.evidence).toBeDefined();
      else expect(CLIENT_VIEW.nav.some((n) => n.id === t.view), t.view).toBe(true);
    }
    for (const a of CLIENT_VIEW.alerts) expect(SAMPLE.evidence[a.evidence], a.title).toBeDefined();

    render(<ClientView />);
    fireEvent.click(within(panel()).getByRole('button', { name: /Competitor price moves/ }));
    expect(screen.getByRole('dialog', { name: /kestrel-mechanical\.example/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close evidence' }));
    fireEvent.click(within(panel()).getByRole('button', { name: new RegExp(CLIENT_VIEW.alerts[2].title) }));
    expect(screen.getByRole('dialog', { name: /^Ad · Meta/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close evidence' }));
    fireEvent.click(within(panel()).getByRole('button', { name: /Your rating vs area/ }));
    expect(screen.getByText(`Reviews · ${SAMPLE.business.name}`)).toBeTruthy();
    for (const r of CLIENT_VIEW.reviews.reviews) expect(within(panel()).getByText(r.text)).toBeTruthy();
  });

  it('the brief tab shows the email sent in the agency name with the first three items', () => {
    render(<ClientView />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Monday brief' }));
    expect(screen.getByRole('tab', { name: 'Monday brief' }).getAttribute('aria-selected')).toBe('true');
    expect(within(panel('Monday brief')).getByText(new RegExp(CLIENT_VIEW.agency.emailFrom.replace('.', '\\.')))).toBeTruthy();
    for (const item of SAMPLE.items.slice(0, 3)) expect(within(panel('Monday brief')).getByText(item.headline)).toBeTruthy();
  });

  it('the Friday tab shows a cited answer with numbered sources', () => {
    render(<ClientView />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Friday' }));
    const answer = FRIDAY_ANSWERS.find((a) => a.id === 'map-leader')!;
    expect(within(panel('Friday')).getByText(answer.question)).toBeTruthy();
    const cites = new Set(answer.answer.flatMap((p) => (p.cite ? [p.cite] : [])));
    expect(within(panel('Friday')).getByText(CLIENT_VIEW.friday.sourcesLabel).parentElement!.nextElementSibling!.querySelectorAll('li')).toHaveLength(cites.size);
  });

  it('never names Rival Monday inside the client view (white label)', () => {
    const { container } = render(<ClientView />);
    const windowText = container.querySelector('[role="tablist"]')!.parentElement!.textContent!;
    expect(windowText).not.toMatch(/rival\s*monday/i);
  });

  it('each tab has three numbered notes, each with a matching marker in its window', () => {
    render(<ClientView />);
    for (const [tab, name] of [['dashboard', 'Dashboard'], ['brief', 'Monday brief'], ['friday', 'Friday']] as const) {
      fireEvent.mouseDown(screen.getByRole('tab', { name }));
      const notes = within(screen.getByRole('list', { name: 'What to notice' })).getAllByRole('listitem');
      expect(notes.map((n) => n.querySelector('span.block')!.textContent)).toEqual(CLIENT_VIEW.notes[tab].map((n) => n.title));
      const marks = [...panel(name).querySelectorAll('[data-note-mark]')].map((m) => m.getAttribute('data-note-mark')).sort();
      expect(marks).toEqual(['1', '2', '3']);
    }
  });
});
