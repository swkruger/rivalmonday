// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('shows the dark-button line only when the primary gets dark text', () => {
    render(<BrandingEditor initial={{ primary: '#F5D90A' }} agencyName="Acme" action={action} />);
    const input = screen.getByLabelText('Primary colour');
    expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent).toBe('Buttons will use dark text so they stay readable.');
    fireEvent.change(input, { target: { value: '#0B2540' } });
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
});
