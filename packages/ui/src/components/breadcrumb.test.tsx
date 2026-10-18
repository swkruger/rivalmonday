// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from './breadcrumb';

function Trail() {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="/c/acme">Acme Heating</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>Briefs &amp; reports</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

describe('Breadcrumb', () => {
  it('renders a nav landmark labelled "Breadcrumb"', () => {
    render(<Trail />);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeTruthy();
  });

  it('marks the last item as the current page', () => {
    render(<Trail />);
    const current = screen.getByText('Briefs & reports');
    expect(current.getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Acme Heating' }).getAttribute('aria-current')).toBeNull();
  });

  it('renders the › separator hidden from assistive tech', () => {
    const { container } = render(<Trail />);
    const sep = container.querySelector('[data-slot="breadcrumb-separator"]');
    expect(sep?.textContent).toBe('›');
    expect(sep?.getAttribute('aria-hidden')).toBe('true');
  });
});
