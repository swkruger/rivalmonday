import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LegalDocument, parseLegal } from './legal-page';

const MD = `<!-- OWNER-PLACEHOLDER: x -->
Last updated: 2026-10-29

# Inside heading

## Section

Body text.

<script>alert(1)</script>
<b id="raw">raw</b>
`;

describe('LegalDocument', () => {
  it('renders the markdown with one h1', () => {
    render(<LegalDocument title="Privacy" markdown={MD} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Privacy');
    expect(screen.getByRole('heading', { level: 2, name: 'Inside heading' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Section' })).toBeTruthy();
    expect(screen.getByText('Last updated 29 Oct 2026')).toBeTruthy();
    expect(screen.queryByText(/Last updated: /)).toBeNull();
  });

  it('raw html is not rendered', () => {
    const { container } = render(<LegalDocument title="Privacy" markdown={MD} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('#raw')).toBeNull();
  });

  it('parseLegal returns no date when the line is missing', () => {
    expect(parseLegal('Hello').updated).toBeNull();
  });
});
