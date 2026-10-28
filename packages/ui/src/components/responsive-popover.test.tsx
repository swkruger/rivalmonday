// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { ResponsivePopover } from './responsive-popover';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from './sheet';

type Listener = (e: { matches: boolean }) => void;
const listeners = new Set<Listener>();
let wide = true;
function stub(initial: boolean) {
  wide = initial;
  listeners.clear();
  window.matchMedia = ((q: string) => ({
    matches: wide, media: q,
    addEventListener: (_: string, l: Listener) => listeners.add(l),
    removeEventListener: (_: string, l: Listener) => listeners.delete(l),
  })) as unknown as typeof window.matchMedia;
}
const cross = (matches: boolean) => act(() => { wide = matches; listeners.forEach((l) => l({ matches })); });

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <ResponsivePopover open={open} onOpenChange={setOpen} title="Tip title" trigger={<button type="button">Open tip</button>}>
      <p>Tip body</p>
    </ResponsivePopover>
  );
}

afterEach(() => { cleanup(); // @ts-expect-error reset the stub
  delete window.matchMedia;
});

describe('ResponsivePopover', () => {
  it('renders the popover markup before matchMedia resolves', () => {
    const html = renderToString(<Harness />);
    expect(html).toContain('data-slot="popover-trigger"');
    expect(html).not.toContain('data-slot="sheet-trigger"');
  });

  it('opens a popover at >= 768', async () => {
    stub(true);
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open tip' }));
    expect(await screen.findByText('Tip body')).toBeTruthy();
    expect(document.querySelector('[data-slot="popover-content"]')).toBeTruthy();
  });

  it('below 768 opens a dialog named by the title; Esc closes and focus returns to the trigger', async () => {
    stub(false);
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open tip' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Tip title' });
    expect(dialog.querySelector('[data-slot="sheet-handle"]')?.getAttribute('aria-hidden')).toBe('true');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('closes the sheet when crossing to >= 768', async () => {
    stub(false);
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open tip' }));
    await screen.findByRole('dialog');
    cross(true);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Tip body')).toBeNull();
  });

  it('the sheet has a named Close button that closes it and returns focus to the trigger', async () => {
    stub(false);
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open tip' });
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByRole('dialog', { name: 'Tip title' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('inside a sheet below 768 it stays a popover (no nested sheet)', async () => {
    stub(false);
    render(
      <Sheet open onOpenChange={() => {}}>
        <SheetTrigger>outer</SheetTrigger>
        <SheetContent side="right" aria-describedby={undefined}>
          <SheetTitle>Outer</SheetTitle>
          <Harness />
        </SheetContent>
      </Sheet>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open tip' }));
    expect(await screen.findByText('Tip body')).toBeTruthy();
    expect(document.querySelector('[data-slot="popover-content"]')).toBeTruthy();
    expect(document.querySelectorAll('[data-slot="sheet-content"]').length).toBe(1);
  });
});
