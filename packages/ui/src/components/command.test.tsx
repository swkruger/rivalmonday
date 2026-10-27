// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './command';

// cmdk measures its list and scrolls the selected item into view; jsdom has neither.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
});

describe('Command', () => {
  it('filters items by the typed query and shows the empty state', () => {
    render(
      <Command>
        <CommandInput placeholder="Find a client" />
        <CommandList>
          <CommandEmpty>No matches</CommandEmpty>
          <CommandGroup heading="Clients">
            <CommandItem>Acme Heating</CommandItem>
            <CommandItem>Bright Smiles Dental</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>,
    );
    const input = screen.getByPlaceholderText('Find a client');
    expect(screen.getAllByRole('option')).toHaveLength(2);

    fireEvent.change(input, { target: { value: 'dental' } });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Bright Smiles Dental']);

    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('No matches')).toBeTruthy();
  });
});

describe('Command input height', () => {
  it('matches the h-11 wrapper', () => {
    render(<Command><CommandInput placeholder="Find" /></Command>);
    const cls = screen.getByPlaceholderText('Find').className;
    expect(cls).toContain('h-11');
    expect(cls).not.toContain('h-10');
  });
});

describe('Command chrome', () => {
  it('the root has no frame chrome, so a Command inside a Popover does not double it', () => {
    render(<Command><CommandInput placeholder="Find" /></Command>);
    const cls = document.querySelector('[data-slot="command"]')!.className.split(' ');
    for (const c of ['border', 'shadow-overlay', 'rounded-md']) expect(cls).not.toContain(c);
  });
  it('CommandDialog carries the palette chrome and an accessible title', () => {
    render(
      <CommandDialog open title="Search">
        <CommandInput placeholder="Find" />
      </CommandDialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Search' });
    expect(dialog.className.split(' ')).toEqual(expect.arrayContaining(['border', 'border-line', 'rounded-md', 'shadow-overlay']));
    expect(dialog.className.split(' ')).not.toContain('shadow-dialog');
    expect(dialog.querySelector('[data-slot="command"]')).not.toBeNull();
  });
});
