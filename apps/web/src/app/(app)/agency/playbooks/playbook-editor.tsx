'use client';
import type { PlaybookView } from '@cs/tools';
import { Badge, Button, Input, Label } from '@cs/ui';
import { useActionState } from 'react';
import type { FormResult } from '@/server/forms';

const area = 'w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

export function PlaybookEditor({ verticalId, playbook: p, canEdit, action }: { verticalId: string; playbook: PlaybookView; canEdit: boolean; action: (prev: FormResult, fd: FormData) => Promise<FormResult> }) {
  const [state, formAction, pending] = useActionState(action, { ok: true } as FormResult);
  const id = `${verticalId}-${p.id}`;
  return (
    <div className="flex flex-col gap-3 rounded-[14px] bg-surface p-6 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{p.trigger}</Badge>
        {p.overridden && <Badge>Edited</Badge>}
        {p.disabled && <Badge variant="secondary">Off</Badge>}
      </div>
      {!canEdit ? (
        <>
          <h3 className="font-semibold">{p.title}</h3>
          <p className="whitespace-pre-wrap text-sm">{p.template}</p>
        </>
      ) : (
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="verticalId" value={verticalId} />
          <input type="hidden" name="playbookId" value={p.id} />
          <input type="hidden" name="disabled" value={p.disabled ? 'true' : 'false'} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`title-${id}`}>Title</Label>
            <Input id={`title-${id}`} name="title" defaultValue={p.title} maxLength={200} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`template-${id}`}>Template</Label>
            <textarea id={`template-${id}`} name="template" defaultValue={p.template} rows={4} maxLength={2000} className={area} />
            <p className="text-xs text-muted-ink">Placeholders: {'{{competitor}} {{service}} {{new_price}} {{areas}} {{theme}}'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" name="intent" value="save" disabled={pending}>Save</Button>
            <Button type="submit" name="intent" value={p.disabled ? 'enable' : 'disable'} variant="outline" disabled={pending}>{p.disabled ? 'Turn on' : 'Turn off'}</Button>
            {p.overridden && <Button type="submit" name="intent" value="reset" variant="outline" disabled={pending}>Reset to standard</Button>}
          </div>
          {!state.ok && <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">{state.error}</p>}
          {state.ok && state.message && <p className="rounded-lg bg-muted-surface p-3 text-ink">{state.message}</p>}
        </form>
      )}
      {p.overridden && (
        <details className="text-sm text-muted-ink">
          <summary>Standard text</summary>
          <p className="mt-1 font-semibold">{p.packTitle}</p>
          <p className="whitespace-pre-wrap">{p.packTemplate}</p>
        </details>
      )}
    </div>
  );
}
