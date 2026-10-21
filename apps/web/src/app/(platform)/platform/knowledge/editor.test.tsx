// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormResult } from '@/server/forms';
import { type EditorArticle, KbEditor } from './editor';
import { IMPORT_ERROR_COPY, importErrorCopy } from './import-errors';
import { ImportPanel } from './import-panel';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const targets = { agencies: [{ id: 'a1', name: 'Ag One', clients: [{ id: 'c1', name: 'Lone Star' }] }] };
const ok = vi.fn(async (_p: FormResult, _fd: FormData): Promise<FormResult> => ({ ok: true, message: 'Draft saved.' }));
const actions = { save: ok, remove: ok, autoSync: ok };
const article = (o: Partial<EditorArticle> = {}): EditorArticle => ({
  id: 'x1', title: 'Alerts', level: 'platform', agencyId: null, clientId: null, kind: 'help', bodyMd: '# Heading\n\nBody', previousBodyMd: null, status: 'draft',
  clientVisible: true, source: 'manual', sourceUrl: null, autoSync: false, syncError: null, ...o,
});
beforeEach(() => { ok.mockClear(); push.mockClear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('KbEditor', () => {
  it('seed rows are read-only with the Managed in repo note', () => {
    render(<KbEditor article={article({ source: 'seed' })} targets={targets} actions={actions} />);
    expect(screen.getByText('Managed in repo')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /save draft|publish|delete/i })).toBeNull();
  });

  it('Publish submits intent=publish with the form values; Unpublish only on published rows', async () => {
    const { rerender } = render(<KbEditor article={article()} targets={targets} actions={actions} />);
    expect(screen.queryByRole('button', { name: 'Unpublish' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(ok).toHaveBeenCalled());
    const fd = ok.mock.calls[0]![1];
    expect([fd.get('intent'), fd.get('id'), fd.get('title'), fd.get('bodyMd')]).toEqual(['publish', 'x1', 'Alerts', '# Heading\n\nBody']);
    rerender(<KbEditor article={article({ status: 'published' })} targets={targets} actions={actions} />);
    expect(screen.getByRole('button', { name: 'Unpublish' })).toBeTruthy();
    expect(screen.getByText('Draft saved.')).toBeTruthy();
  });

  it('previews the Markdown, and the client-visible checkbox shows only at agency level', () => {
    render(<KbEditor article={article()} targets={targets} actions={actions} />);
    expect(screen.queryByLabelText('Visible to client users')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    expect(screen.getByRole('heading', { name: 'Heading' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Level'), { target: { value: 'agency' } });
    expect(screen.getByLabelText('Visible to client users')).toBeTruthy();
    expect(screen.getByLabelText('Agency')).toBeTruthy();
  });

  it('delete needs a confirm step', () => {
    render(<KbEditor article={article()} targets={targets} actions={actions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(ok).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete article' })).toBeTruthy();
  });

  it('URL rows show the source link, auto-sync toggle and a collapsible previous version', () => {
    render(<KbEditor article={article({ source: 'url', sourceUrl: 'https://x.example/a', autoSync: true, previousBodyMd: 'Old body' })} targets={targets} actions={actions} />);
    expect(screen.getByRole('link', { name: 'https://x.example/a' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Turn off auto-sync' })).toBeTruthy();
    expect(screen.getByText('Previous version')).toBeTruthy();
    expect(screen.getByText('Old body')).toBeTruthy();
  });
});

describe('ImportPanel', () => {
  it('maps every ImportError to its decided copy', () => {
    expect(IMPORT_ERROR_COPY).toEqual({
      robots_disallowed: "The site's robots.txt doesn't allow us to read this page.",
      blocked: 'The site blocked our request.',
      http_error: 'The page returned an error.',
      no_content: "We couldn't find readable text on this page.",
      off_site: 'The page redirected to another site.',
      fetch_failed: "We couldn't load the page. Try again later.",
      not_public: 'That address is not a public web page.',
    });
    expect(importErrorCopy(undefined)).toBe(IMPORT_ERROR_COPY.fetch_failed);
  });

  it('polls every 2 s and routes to the draft when done', async () => {
    vi.useFakeTimers();
    const start = vi.fn(async () => ({ ok: true as const, key: 'k1' }));
    const status = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: { state: 'running' } })
      .mockResolvedValueOnce({ ok: true, status: { state: 'done', articleId: 'art1' } });
    render(<ImportPanel targets={targets} start={start} status={status} />);
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'https://x.example/a' } });
    await act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Import' }).closest('form')!); });
    expect(status).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(status).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(push).toHaveBeenCalledWith('/platform/knowledge/art1');
  });

  it('stops polling and shows fetch_failed copy when status throws', async () => {
    vi.useFakeTimers();
    const start = vi.fn(async () => ({ ok: true as const, key: 'k1' }));
    const status = vi.fn().mockRejectedValue(new Error('boom'));
    render(<ImportPanel targets={targets} start={start} status={status} />);
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'https://x.example/a' } });
    await act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Import' }).closest('form')!); });
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(status).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').textContent).toBe("We couldn't load the page. Try again later.");
  });

  it('shows the decided copy for a failed import', async () => {
    vi.useFakeTimers();
    const start = vi.fn(async () => ({ ok: true as const, key: 'k1' }));
    const status = vi.fn().mockResolvedValue({ ok: true, status: { state: 'failed', error: 'robots_disallowed' } });
    render(<ImportPanel targets={targets} start={start} status={status} />);
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'https://x.example/a' } });
    await act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Import' }).closest('form')!); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.getByRole('alert').textContent).toBe("The site's robots.txt doesn't allow us to read this page.");
    expect(push).not.toHaveBeenCalled();
  });
});
