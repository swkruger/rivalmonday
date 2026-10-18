// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

function Example() {
  return (
    <Tabs defaultValue="briefs">
      <TabsList aria-label="Briefs and reports">
        <TabsTrigger value="briefs">Briefs</TabsTrigger>
        <TabsTrigger value="reports">Reports</TabsTrigger>
        <TabsTrigger value="exports">Exports</TabsTrigger>
      </TabsList>
      <TabsContent value="briefs">Weekly briefs</TabsContent>
      <TabsContent value="reports">Quarterly reports</TabsContent>
      <TabsContent value="exports">Exports panel</TabsContent>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('exposes tab and tabpanel roles with the default tab selected', () => {
    render(<Example />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Briefs', 'Reports', 'Exports']);
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
    const panel = screen.getByRole('tabpanel');
    expect(panel.textContent).toBe('Weekly briefs');
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[0]!.id);
  });

  // Radix roving focus moves focus in a setTimeout, so each step waits for it.
  it('moves between triggers with the arrow keys', async () => {
    render(<Example />);
    const [briefs, reports, exports] = screen.getAllByRole('tab');
    act(() => briefs!.focus());
    fireEvent.keyDown(briefs!, { key: 'ArrowRight' });
    await waitFor(() => expect(document.activeElement).toBe(reports));
    expect(reports!.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel').textContent).toBe('Quarterly reports');

    fireEvent.keyDown(reports!, { key: 'ArrowRight' });
    await waitFor(() => expect(document.activeElement).toBe(exports));

    // Wraps around from the last trigger to the first.
    fireEvent.keyDown(exports!, { key: 'ArrowRight' });
    await waitFor(() => expect(document.activeElement).toBe(briefs));

    fireEvent.keyDown(briefs!, { key: 'ArrowLeft' });
    await waitFor(() => expect(document.activeElement).toBe(exports));
    expect(screen.getByRole('tabpanel').textContent).toBe('Exports panel');
  });
});
