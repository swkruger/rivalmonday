'use client';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Input, Label } from '@cs/ui';
import { useActionState } from 'react';
import { WriteGuard } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import { updateCostServiceAction } from '../actions';
import { FormMessage, useCloseOnSave } from './form-bits';
import type { CostService } from './types';

/** Services that bill per unit, so a dollar rate turns units into an estimate (spec: scrapecreators and neon only). */
const HAS_RATE = new Set(['scrapecreators', 'neon']);

/** Usage services whose API reports no plan cap: with nothing to compare usage against, they can never be Low. */
const NO_CAP = new Set(['anthropic', 'neon']);

export function ServiceSettingsDialog({ service }: { service: CostService }) {
  const [state, formAction, pending] = useActionState(updateCostServiceAction, { ok: true } as FormResult);
  const { open, setOpen, formKey, shown } = useCloseOnSave(state);
  return (
    <WriteGuard>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" aria-label={`Edit ${service.label}`}>Edit</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{service.label} settings</DialogTitle>
            <DialogDescription>Billing link, low-balance threshold and warning window.</DialogDescription>
          </DialogHeader>
          <form key={formKey} action={formAction} className="flex flex-col gap-3">
            <FormMessage state={shown} />
            <input type="hidden" name="service" value={service.service} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="enabled" defaultChecked={service.enabled} className="h-4 w-4 rounded border-input" /> Track this service
            </label>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`bu-${service.service}`}>Billing URL</Label>
              <Input id={`bu-${service.service}`} name="billingUrl" type="url" defaultValue={service.billingUrl ?? ''} placeholder="https://" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`lt-${service.service}`}>Low balance threshold (USD)</Label>
              <Input id={`lt-${service.service}`} name="lowThresholdUsd" inputMode="decimal" defaultValue={service.lowThresholdUsd ?? ''} />
              {HAS_RATE.has(service.service) && service.unitRateUsd == null && (
                <p className="text-xs text-muted-foreground">Warnings need a dollars-per-{service.unit === 'credits' ? 'credit' : 'CU-hour'} rate.</p>
              )}
              {NO_CAP.has(service.service) && <p className="text-xs text-muted-foreground">Usage services without a plan cap never warn.</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`wd-${service.service}`}>Warn when days left is under</Label>
              <Input id={`wd-${service.service}`} name="warnDays" inputMode="numeric" defaultValue={service.warnDays} required />
            </div>
            {HAS_RATE.has(service.service) && (
              <div className="flex flex-col gap-2">
                <Label htmlFor={`ur-${service.service}`}>Dollars per {service.unit === 'credits' ? 'credit' : 'CU-hour'}</Label>
                <Input id={`ur-${service.service}`} name="unitRateUsd" inputMode="decimal" defaultValue={service.unitRateUsd ?? ''} />
              </div>
            )}
            <DialogFooter>
              <Button type="submit" disabled={pending}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </WriteGuard>
  );
}
