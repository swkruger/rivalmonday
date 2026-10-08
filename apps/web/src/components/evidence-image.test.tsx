// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EvidenceImage } from './evidence-image';

describe('EvidenceImage', () => {
  it('renders the image with its alt text while it loads', () => {
    render(<EvidenceImage src="/files/evidence/c/e" alt="Before snapshot of https://example.com" />);
    expect(screen.getByRole('img', { name: 'Before snapshot of https://example.com' }).getAttribute('src')).toBe('/files/evidence/c/e');
    expect(screen.queryByText('Snapshot not available')).toBeNull();
  });

  it('swaps to "Snapshot not available" when the stored object is missing (Review Focus 5)', () => {
    render(<EvidenceImage src="/files/evidence/c/e" alt="Snapshot of x" />);
    fireEvent.error(screen.getByRole('img', { name: 'Snapshot of x' }));
    expect(screen.getByText('Snapshot not available')).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Snapshot of x' })).toBeNull();
  });
});
