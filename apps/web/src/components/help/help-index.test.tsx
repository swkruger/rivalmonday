// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a> }));
const { HelpIndex } = await import('./help-index');

afterEach(cleanup);
const base = { articleBase: '/kb', groups: [], glossary: [], query: '', results: null, ask: null, contactEmail: null };

describe('HelpIndex', () => {
  it('renders grouped guides linking to the article base, and no search results without a query', () => {
    render(<HelpIndex {...base} groups={[{ heading: 'Insights', guides: [{ helpKey: 'page:client.reviews', title: 'Reviews', articleId: 'a1' }] }]} />);
    expect(screen.getByRole('heading', { name: 'Guides' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Insights' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Reviews' }).getAttribute('href')).toBe('/kb/a1');
    expect(screen.queryByRole('heading', { name: 'Search results' })).toBeNull();
    expect((screen.getByRole('searchbox') as HTMLInputElement).name).toBe('q');
  });

  it('renders search results and an empty-result line', () => {
    const { rerender } = render(<HelpIndex {...base} query="pricing" results={[{ kbId: 'k1', title: 'Pricing page', excerpt: 'How prices are tracked.' }]} />);
    expect(screen.getByRole('link', { name: 'Pricing page' }).getAttribute('href')).toBe('/kb/k1');
    expect(screen.getByText('How prices are tracked.')).toBeTruthy();
    rerender(<HelpIndex {...base} articleBase="/platform/knowledge" query="zzz" results={[]} />);
    expect(screen.getByText('No results for “zzz”.')).toBeTruthy();
  });

  it('shows the glossary only when it has terms', () => {
    const { rerender } = render(<HelpIndex {...base} />);
    expect(screen.queryByRole('heading', { name: 'Glossary' })).toBeNull();
    rerender(<HelpIndex {...base} glossary={[{ id: 'pressure', term: 'Pressure', short: 'How hard rivals push.' }]} />);
    const section = screen.getByRole('heading', { name: 'Glossary' }).closest('section')!;
    expect(within(section).getByText('Pressure')).toBeTruthy();
    expect(within(section).getByText('How hard rivals push.')).toBeTruthy();
  });

  it('shows the Ask and Contact lines only when given', () => {
    const { rerender } = render(<HelpIndex {...base} />);
    expect(screen.queryByRole('link', { name: /Ask/ })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Contact your agency' })).toBeNull();
    rerender(<HelpIndex {...base} ask={{ href: '/c/x/ask', label: 'Ask Friday' }} contactEmail="help@acme.test" />);
    expect(screen.getByRole('link', { name: 'Ask Friday' }).getAttribute('href')).toBe('/c/x/ask');
    expect(screen.getByRole('link', { name: 'Contact your agency' }).getAttribute('href')).toBe('mailto:help@acme.test');
  });
});
