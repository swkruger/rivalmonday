// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadOnlyProvider } from '@/components/read-only';

const m = vi.hoisted(() => ({ updateName: vi.fn(), removeAvatar: vi.fn(), refresh: vi.fn() }));
vi.mock('./actions', () => ({ updateNameAction: m.updateName, removeAvatarAction: m.removeAvatar }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: m.refresh, push: vi.fn(), replace: vi.fn() }) }));

const { DetailsForm } = await import('./details-form');
const { AvatarControl } = await import('./avatar-control');

const fetchMock = vi.fn();
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); fetchMock.mockReset(); m.updateName.mockReset(); m.removeAvatar.mockReset(); m.refresh.mockReset(); });

describe('DetailsForm', () => {
  it('shows the name and a read-only email with its hint', () => {
    render(<DetailsForm name="Pat Doe" email="pat@example.com" />);
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Pat Doe');
    const email = screen.getByLabelText('Email') as HTMLInputElement;
    expect(email.readOnly).toBe(true);
    expect(screen.getByText('This is the address you sign in with.')).toBeTruthy();
  });

  it('saving calls the action and shows Saved.', async () => {
    m.updateName.mockResolvedValue({ ok: true, message: 'Saved.' });
    render(<DetailsForm name="Pat Doe" email="pat@example.com" />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Patricia Doe' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Saved.'));
    expect((m.updateName.mock.calls[0]![1] as FormData).get('name')).toBe('Patricia Doe');
    await waitFor(() => expect(m.refresh).toHaveBeenCalled());
  });

  it('a name saved with a trailing space settles on the trimmed value and still says Saved.', async () => {
    m.updateName.mockResolvedValue({ ok: true, message: 'Saved.' });
    render(<DetailsForm name="Pat Doe" email="pat@example.com" />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Patricia Doe ' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Saved.'));
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Patricia Doe');
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('a blank name shows the error and keeps what was typed', async () => {
    m.updateName.mockResolvedValue({ ok: false, error: 'Enter your name.' });
    render(<DetailsForm name="Pat Doe" email="pat@example.com" />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  ' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Enter your name.'));
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('  ');
  });
});

describe('AvatarControl', () => {
  const file = () => new File([new Uint8Array([1, 2, 3])], 'me.png', { type: 'image/png' });
  const choose = () => fireEvent.change(screen.getByLabelText('Photo file'), { target: { files: [file()] } });

  it('an upload success shows the new photo, says Saved. and refreshes the page', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ avatarUrl: '/files/avatar/u/abc.png' }), { status: 200 }));
    const { container } = render(<AvatarControl name="Pat Doe" email="p@x.co" avatarUrl={null} />);
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    choose();
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Saved.'));
    expect(fetchMock.mock.calls[0]![0]).toBe('/settings/profile/avatar');
    expect(m.refresh).toHaveBeenCalled();
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/files/avatar/u/abc.png');
  });

  it('a 400 shows the server copy and does not refresh', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'too_large', message: 'That photo is too big.' }), { status: 400 }));
    render(<AvatarControl name="Pat Doe" email="p@x.co" avatarUrl={null} />);
    choose();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('That photo is too big.'));
    expect(m.refresh).not.toHaveBeenCalled();
  });

  it('a file over 4 MB is refused here with the decided copy, with no upload', async () => {
    render(<AvatarControl name="Pat Doe" email="p@x.co" avatarUrl={null} />);
    const big = new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Photo file'), { target: { files: [big] } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Photo must be 4 MB or smaller.'));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('a file of exactly 4 MB still uploads', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ avatarUrl: '/files/avatar/u/abc.png' }), { status: 200 }));
    render(<AvatarControl name="Pat Doe" email="p@x.co" avatarUrl={null} />);
    const edge = new File([new Uint8Array(4 * 1024 * 1024)], 'edge.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Photo file'), { target: { files: [edge] } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it('Remove asks first, then removes and refreshes', async () => {
    m.removeAvatar.mockResolvedValue({ ok: true, message: 'Saved.' });
    const { container } = render(<AvatarControl name="Pat Doe" email="p@x.co" avatarUrl="/files/avatar/u/abc.png" />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByText('Remove your photo?')).toBeTruthy();
    expect(screen.getByText('Your initials show instead.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    await waitFor(() => expect(m.removeAvatar).toHaveBeenCalled());
    await waitFor(() => expect(m.refresh).toHaveBeenCalled());
    expect(container.querySelector('img')).toBeNull();
  });

  it('is hidden in a read-only support session', () => {
    render(<ReadOnlyProvider readOnly><AvatarControl name="Pat Doe" email="p@x.co" avatarUrl="/files/avatar/u/abc.png" /></ReadOnlyProvider>);
    expect(screen.queryByRole('button', { name: 'Upload photo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });
});
