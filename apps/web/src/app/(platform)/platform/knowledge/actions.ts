'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOperatorContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';
import type { ImportStatus, ImportStatusResult, StartImportResult } from './import-errors';

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const opt = (fd: FormData, k: string) => str(fd, k) || undefined;
const LIST = '/platform/knowledge';

/** Scope ids only apply at the matching level; the tool validates the combination. */
function scopeOf(fd: FormData) {
  const level = str(fd, 'level');
  return {
    level,
    ...(level !== 'platform' && opt(fd, 'agencyId') ? { agencyId: opt(fd, 'agencyId') } : {}),
    ...(level === 'client' && opt(fd, 'clientId') ? { clientId: opt(fd, 'clientId') } : {}),
  };
}

/** `intent` (the pressed button) decides the status: "draft" and "unpublish" save a draft, "publish" publishes. */
export async function saveKbArticleAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireOperatorContext();
  const id = opt(fd, 'id');
  const scope = scopeOf(fd);
  const r = await runTool<{ id: string; lintWarnings: string[] }>(ctx, 'upsert_kb_article', {
    ...(id ? { id } : {}),
    ...scope,
    kind: str(fd, 'kind'),
    title: str(fd, 'title'),
    bodyMd: String(fd.get('bodyMd') ?? ''),
    clientVisible: scope.level === 'agency' ? fd.get('clientVisible') === 'on' : true,
    status: str(fd, 'intent') === 'publish' ? 'published' : 'draft',
  });
  if (!r.ok) return r;
  revalidatePath(LIST);
  const warnings = r.data.lintWarnings;
  if (!id) redirect(`${LIST}/${r.data.id}${warnings.length ? `?lint=${encodeURIComponent(warnings.join('|'))}` : ''}`);
  revalidatePath(`${LIST}/${r.data.id}`);
  const verb = str(fd, 'intent') === 'publish' ? 'Published.' : str(fd, 'intent') === 'unpublish' ? 'Unpublished.' : 'Draft saved.';
  return { ok: true, message: warnings.length ? `${verb} Warnings: ${warnings.join(' ')}` : verb };
}

export async function deleteKbArticleAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireOperatorContext();
  const r = await runTool(ctx, 'delete_kb_article', { id: str(fd, 'id') });
  if (!r.ok) return r;
  revalidatePath(LIST);
  redirect(LIST);
}

export async function setKbAutoSyncAction(_p: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireOperatorContext();
  const id = str(fd, 'id');
  const autoSync = fd.get('autoSync') === 'true';
  const r = await runTool(ctx, 'set_kb_auto_sync', { id, autoSync });
  if (!r.ok) return r;
  revalidatePath(`${LIST}/${id}`);
  revalidatePath(LIST);
  return { ok: true, message: autoSync ? 'Auto-sync on.' : 'Auto-sync off.' };
}

export async function startKbImportAction(fd: FormData): Promise<StartImportResult> {
  const { ctx } = await requireOperatorContext();
  const r = await runTool<{ key: string }>(ctx, 'import_kb_url', {
    url: str(fd, 'url'),
    ...scopeOf(fd),
    kind: str(fd, 'kind'),
    autoSync: fd.get('autoSync') === 'on',
  });
  return r.ok ? { ok: true, key: r.data.key } : r;
}

export async function kbImportStatusAction(key: string): Promise<ImportStatusResult> {
  const { ctx } = await requireOperatorContext();
  const r = await runTool<ImportStatus>(ctx, 'get_kb_import_status', { key });
  return r.ok ? { ok: true, status: r.data } : r;
}
