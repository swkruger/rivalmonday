// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { brandInk } from '@cs/ui';
import { ReadOnlyProvider } from '@/components/read-only';
import { BrandingEditor } from './branding-editor';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const action = vi.fn(async () => ({ ok: true as const }));
const file = () => new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' });
const pick = async (f: File) => { await act(async () => { fireEvent.change(screen.getByLabelText('Upload logo'), { target: { files: [f] } }); }); };

describe('BrandingEditor', () => {
  it('previews both the dashboard header and the email header', () => {
    render(<BrandingEditor initial={{ displayName: 'Acme' }} agencyName="Acme" action={action} />);
    expect(screen.getByTestId('preview-dashboard-header').textContent).toContain('Acme');
    expect(screen.getByTestId('preview-email-header').textContent).toContain('Acme');
  });

  it('uploads the chosen file to the logo route and fills the logo URL with the response', async () => {
    const fetchMock = vi.fn(async () => Response.json({ logoUrl: 'http://localhost:3000/files/logo/a/h.png' }));
    vi.stubGlobal('fetch', fetchMock);
    render(<BrandingEditor initial={{}} agencyName="Acme" action={action} />);
    await pick(file());
    await waitFor(() => expect((screen.getByLabelText(/Logo URL/) as HTMLInputElement).value).toBe('http://localhost:3000/files/logo/a/h.png'));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/agency/settings/branding/logo');
    expect(init.method).toBe('POST');
    expect((init.body as FormData).get('file')).toBeInstanceOf(File);
  });

  it('shows the route message when the upload is refused and keeps the old logo URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'too_large', message: 'That file is too big.' }, { status: 400 })));
    render(<BrandingEditor initial={{ logoUrl: 'https://x.co/l.png' }} agencyName="Acme" action={action} />);
    await pick(file());
    expect(await screen.findByText('That file is too big.')).toBeTruthy();
    expect((screen.getByLabelText(/Logo URL/) as HTMLInputElement).value).toBe('https://x.co/l.png');
  });

  it('renders the footer slot and a custom submit label', () => {
    render(<BrandingEditor initial={{}} agencyName="Acme" action={action} submitLabel="Save and continue" footer={<span>foot</span>} />);
    expect(screen.getByRole('button', { name: 'Save and continue' })).toBeTruthy();
    expect(screen.getByText('foot')).toBeTruthy();
  });

  it('branding colour inputs are labelled', () => {
    render(<BrandingEditor initial={{}} agencyName="Acme" action={action} />);
    expect((screen.getByLabelText('Primary colour') as HTMLInputElement).placeholder).toBe('#47A8E7');
    expect(screen.getByLabelText('Secondary colour')).toBeTruthy();
  });

  it('shows no note under the primary colour, even when it gets dark text', () => {
    render(<BrandingEditor initial={{ primary: '#F5D90A' }} agencyName="Acme" action={action} />);
    const input = screen.getByLabelText('Primary colour');
    expect(input.getAttribute('aria-describedby')).toBeNull();
    expect(screen.queryByText('Buttons will use dark text so they stay readable.')).toBeNull();
  });

  it('puts "or" between the logo URL and the upload', () => {
    render(<BrandingEditor initial={{}} agencyName="Acme" action={action} />);
    expect(screen.getByText('or')).toBeTruthy();
  });

  it('settings mode: Save changes appears in the save bar once something changes; Discard restores', () => {
    render(<BrandingEditor initial={{ displayName: 'Acme' }} agencyName="Acme" action={action} />);
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Acme 2' } });
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('Acme');
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
  });

  describe('header colour', () => {
    const hidden = () => document.querySelector('input[name="headerColor"]') as HTMLInputElement;
    const band = () => screen.getByTestId('preview-band');
    it('is Automatic by default with an empty hidden input and no picker', () => {
      render(<BrandingEditor initial={{}} agencyName="Acme" action={action} />);
      expect((screen.getByLabelText('Automatic') as HTMLInputElement).checked).toBe(true);
      expect(hidden().value).toBe('');
      expect(screen.queryByRole('textbox', { name: 'Header colour' })).toBeNull();
    });
    it('unchecking Automatic prefills the picker with the derived colour', () => {
      render(<BrandingEditor initial={{ primary: '#47A8E7', secondary: '#2A6BAC' }} agencyName="Acme" action={action} />);
      fireEvent.click(screen.getByLabelText('Automatic'));
      expect((screen.getByRole('textbox', { name: 'Header colour' }) as HTMLInputElement).value).toBe(brandInk('#47A8E7', '#2A6BAC'));
      expect(hidden().value).toBe(brandInk('#47A8E7', '#2A6BAC'));
      fireEvent.click(screen.getByLabelText('Automatic'));
      expect(hidden().value).toBe('');
    });
    it('a failing colour shows the note and a Use button that sets the shade', () => {
      render(<BrandingEditor initial={{ headerColor: '#0B554F' }} agencyName="Acme" action={action} />);
      const input = screen.getByRole('textbox', { name: 'Header colour' }) as HTMLInputElement;
      expect(screen.queryByText('White text is hard to read on this colour.')).toBeNull();
      fireEvent.change(input, { target: { value: '#FFD400' } });
      expect(screen.getByText('White text is hard to read on this colour.')).toBeTruthy();
      const btn = screen.getByRole('button', { name: /^Use #/ });
      const shade = btn.textContent!.replace('Use ', '');
      fireEvent.click(btn);
      expect(input.value).toBe(shade);
      expect(hidden().value).toBe(shade);
      expect(screen.queryByText('White text is hard to read on this colour.')).toBeNull();
    });
    it('the preview band uses the override', () => {
      render(<BrandingEditor initial={{ headerColor: '#0B554F' }} agencyName="Acme" action={action} />);
      const vars = (band().closest('[style]') as HTMLElement).style.getPropertyValue('--brand-ink');
      expect(vars.toUpperCase()).toBe('#0B554F');
      expect(band().className).toContain('rm-ink-band');
    });
    it('a stored header colour opens in manual mode with the hidden input set', () => {
      render(<BrandingEditor initial={{ headerColor: '#0b554f' }} agencyName="Acme" action={action} />);
      expect((screen.getByLabelText('Automatic') as HTMLInputElement).checked).toBe(false);
      expect((screen.getByRole('textbox', { name: 'Header colour' }) as HTMLInputElement).value).toBe('#0b554f');
      expect(screen.getByLabelText('Header colour picker')).toBeTruthy();
      expect(hidden().value).toBe('#0b554f');
    });
    it('is disabled when read-only', () => {
      render(
        <ReadOnlyProvider readOnly>
          <BrandingEditor initial={{ headerColor: '#FFD400' }} agencyName="Acme" action={action} />
        </ReadOnlyProvider>,
      );
      expect(screen.getByLabelText('Automatic').matches(':disabled')).toBe(true);
      expect(screen.getByRole('textbox', { name: 'Header colour' }).matches(':disabled')).toBe(true);
      expect(screen.getByRole('button', { name: /^Use #/ }).matches(':disabled')).toBe(true);
    });
  });
});
