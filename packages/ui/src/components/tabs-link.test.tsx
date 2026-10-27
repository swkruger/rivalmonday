// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TabsLink, TabsLinkList } from './tabs-link';
import { TabsList, TabsTrigger, Tabs } from './tabs';

describe('TabsLinkList / TabsLink (URL-driven tabs styled like Tabs)', () => {
  it('a labelled nav of links; the active one carries aria-current="page"', () => {
    render(
      <TabsLinkList aria-label="Views">
        <TabsLink href="?tab=a" active>A</TabsLink>
        <TabsLink href="?tab=b">B</TabsLink>
      </TabsLinkList>,
    );
    const nav = screen.getByRole('navigation', { name: 'Views' });
    expect(nav.getAttribute('data-slot')).toBe('tabs-link-list');
    expect(screen.getByRole('link', { name: 'A' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'B' }).getAttribute('aria-current')).toBeNull();
  });

  it('asChild renders the caller’s link element (e.g. next/link) as a tab link', () => {
    render(<TabsLink asChild active><a href="/x" data-testid="own">X</a></TabsLink>);
    const a = screen.getByTestId('own');
    expect(a.getAttribute('aria-current')).toBe('page');
    expect(a.getAttribute('data-slot')).toBe('tabs-link');
  });

  it('Tabs keep their tablist / tab roles with the selected tab marked', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList aria-label="T"><TabsTrigger value="a">A</TabsTrigger></TabsList>
      </Tabs>,
    );
    expect(screen.getByRole('tablist', { name: 'T' })).toBeTruthy();
    expect(screen.getByRole('tab').getAttribute('aria-selected')).toBe('true');
  });
});
