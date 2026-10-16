'use client';
import type { AgencyBranding } from '@cs/db';
import { BrandingEditor } from '@/components/agency/branding-editor';
import { saveBrandingAction } from './actions';

/** `/agency/branding`: the shared editor wired to the settings save action. */
export function BrandingForm({ initial, agencyName }: { initial: AgencyBranding; agencyName: string }) {
  return <BrandingEditor initial={initial} agencyName={agencyName} action={saveBrandingAction} />;
}
