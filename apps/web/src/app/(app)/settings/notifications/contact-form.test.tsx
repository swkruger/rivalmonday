// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ContactForm } from './contact-form';

describe('ContactForm (Important I2, final review)', () => {
  it('offers the stored time zone and UTC from the server-built options prop, never calling Intl itself', () => {
    render(<ContactForm contactId="c1" timezone="Asia/Kolkata" quietHours={null} timezoneOptions={['Asia/Kolkata', 'America/Chicago', 'UTC']} />);
    const select = screen.getByLabelText(/time zone/i) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toContain('Asia/Kolkata');
    expect(values).toContain('UTC');
    expect(select.value).toBe('Asia/Kolkata');
  });

  it('preserves the empty "Business time zone" choice for an unset personal time zone', () => {
    render(<ContactForm contactId="c1" timezone={null} quietHours={null} timezoneOptions={['UTC']} />);
    const select = screen.getByLabelText(/time zone/i) as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(screen.getByRole('option', { name: /business time zone/i })).toBeTruthy();
  });

  it('renders no options at all when given none, instead of falling back to a browser-built list', () => {
    render(<ContactForm contactId="c1" timezone={null} quietHours={null} timezoneOptions={[]} />);
    const select = screen.getByLabelText(/time zone/i) as HTMLSelectElement;
    expect(select.options.length).toBe(1); // only "Business time zone"
  });
});
