// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TabsLink, TabsLinkList } from './tabs-link';
import { TabsList, TabsTrigger, Tabs } from './tabs';
import { tabsListClass, tabsTriggerClass } from './tabs-classes';

describe('TabsLinkList / TabsLink (URL-driven tabs styled like Tabs)', () => {
  it('a labelled nav of links; the active one carries aria-current="page"', () => {
    render(
      <TabsLinkList aria-label="Views">
        <TabsLink href="?tab=a" active>A</TabsLink>
        <TabsLink href="?tab=b">B</TabsLink>
      </TabsLinkList>,
    );
    const nav = screen.getByRole('navigation', { name: 'Views' });
    expect(nav.className).toContain(tabsListClass);
    expect(screen.getByRole('link', { name: 'A' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'B' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('link', { name: 'B' }).className).toContain(tabsTriggerClass);
  });

  it('asChild renders the caller’s link element (e.g. next/link) with the tab classes', () => {
    render(<TabsLink asChild active><a href="/x" data-testid="own">X</a></TabsLink>);
    const a = screen.getByTestId('own');
    expect(a.getAttribute('aria-current')).toBe('page');
    expect(a.className).toContain(tabsTriggerClass);
  });

  it('Tabs and the link tabs share the same list and trigger classes', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList aria-label="T"><TabsTrigger value="a">A</TabsTrigger></TabsList>
      </Tabs>,
    );
    expect(screen.getByRole('tablist').className).toContain(tabsListClass);
    expect(screen.getByRole('tab').className).toContain(tabsTriggerClass);
  });
});
