'use client';
import { Button, ConfirmDialog } from '@cs/ui';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { ErrorNote } from '@/components/form-error';
import { WriteGuard } from '@/components/read-only';
import { UserAvatar } from '@/components/user-avatar';
import { AVATAR_ERROR_COPY, AVATAR_MAX_BYTES } from '@/lib/avatar-limits';
import { removeAvatarAction } from './actions';

/**
 * The photo: upload (POST /settings/profile/avatar, the server decides what is acceptable) and remove. The result line lives
 * here, always mounted, so it survives the revalidation; `router.refresh()` updates the top bar's avatar.
 */
export function AvatarControl({ name, email, avatarUrl }: { name: string; email: string; avatarUrl: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(avatarUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function upload(file: File) {
    setError(null);
    setSaved(false);
    // Checked here too: in production a body over 4.5 MB never reaches the route, so its message could not arrive.
    if (file.size > AVATAR_MAX_BYTES) {
      setError(AVATAR_ERROR_COPY.too_large);
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/settings/profile/avatar', { method: 'POST', body });
      const json = (await res.json().catch(() => null)) as { avatarUrl?: string; message?: string } | null;
      if (res.ok && json?.avatarUrl) {
        setUrl(json.avatarUrl);
        setSaved(true);
        router.refresh();
      } else setError(json?.message ?? "That photo couldn't be uploaded. Try a different file.");
    } catch {
      setError("That photo couldn't be uploaded. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="group" aria-label="Your photo" className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <UserAvatar name={name} email={email} avatarUrl={url} size={84} />
        <WriteGuard>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
                {busy ? 'Uploading…' : 'Upload photo'}
              </Button>
              <input
                ref={input}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                aria-label="Photo file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                  e.target.value = '';
                }}
              />
              {url && (
                <ConfirmDialog
                  trigger={<Button type="button" variant="ghost" disabled={busy}>Remove</Button>}
                  title="Remove your photo?"
                  body="Your initials show instead."
                  confirmLabel="Remove photo"
                  tone="danger"
                  action={async () => {
                    setError(null);
                    setSaved(false);
                    const r = await removeAvatarAction();
                    if (r.ok) {
                      setUrl(null);
                      setSaved(true);
                      router.refresh();
                    } else setError(r.error);
                  }}
                />
              )}
            </div>
            <p className="text-sm text-muted-ink">PNG, JPEG or WebP, up to 4 MB.</p>
          </div>
        </WriteGuard>
      </div>
      {error && <ErrorNote compact focusKey={error}>{error}</ErrorNote>}
      {saved && !error && <p role="status" className="text-sm text-ink">Saved.</p>}
    </div>
  );
}
