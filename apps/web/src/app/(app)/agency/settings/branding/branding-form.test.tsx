// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./actions', () => ({ saveBrandingAction: vi.fn() }));
const { BrandingForm } = await import('./branding-form');

describe('BrandingForm assistant name', () => {
  it('is part of the form, prefilled from the stored branding, with a Friday placeholder', () => {
    render(<BrandingForm initial={{ assistantName: 'Robin' }} agencyName="Acme" />);
    const input = screen.getByLabelText('Assistant name') as HTMLInputElement;
    expect(input.name).toBe('assistantName');
    expect(input.value).toBe('Robin');
    expect(input.maxLength).toBe(30);
    expect(input.placeholder).toBe('Friday');
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
  });
});
