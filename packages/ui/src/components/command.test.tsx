// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  Command,
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
  it('matches the h-9 wrapper', () => {
    render(<Command><CommandInput placeholder="Find" /></Command>);
    const cls = screen.getByPlaceholderText('Find').className;
    expect(cls).toContain('h-9');
    expect(cls).not.toContain('h-10');
  });
});
