'use client';
import type { AgencyBranding } from '@cs/db';
import { BrandingEditor } from '@/components/agency/branding-editor';
import { saveBrandingStepAction } from '../actions';
import { StepNav } from '../step-nav';

export function BrandingStep({ initial, agencyName }: { initial: AgencyBranding; agencyName: string }) {
  return <BrandingEditor initial={initial} agencyName={agencyName} action={saveBrandingStepAction} submitLabel="Save and finish" footer={<StepNav step="branding" />} />;
}
