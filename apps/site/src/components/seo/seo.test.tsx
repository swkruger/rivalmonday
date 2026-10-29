import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageIntro } from './page-intro';

describe('PageIntro', () => {
  it('page intro renders one h1, breadcrumb and ld script', () => {
    const { container } = render(<PageIntro path="/how-it-works" eyebrow="How it works" h1="Title here" lead="Lead text" />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Title here');
    expect(screen.getByText('Lead text')).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const links = nav.querySelectorAll('a');
    expect(links[0]?.getAttribute('href')).toBe('/');
    const last = links[links.length - 1];
    expect(last?.getAttribute('href')).toBe('/how-it-works');
    expect(last?.getAttribute('aria-current')).toBe('page');
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts).toHaveLength(1);
    const ld = JSON.parse(scripts[0]!.textContent ?? '');
    expect(ld['@type']).toBe('BreadcrumbList');
    expect(ld.itemListElement).toHaveLength(2);
  });
});
