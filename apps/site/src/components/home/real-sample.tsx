'use client';

import { SECTIONS } from '../../../content/home';
import { JoinButton } from '../join/join-button';
import { usePilot } from '../shell/pilot-context';
import { HomeSectionShell, SectionHeading } from './section-heading';

/** Pilot only: the real sample is requested through the pilot popup, so the section goes when the pilot is off. */
export function RealSample() {
  const { pilotMode } = usePilot();
  if (!pilotMode) return null;
  return (
    <HomeSectionShell id="real-sample" labelledBy="real-sample-heading">
      <div className="flex flex-col items-start gap-6 lg:flex-row lg:items-center lg:justify-between">
        <SectionHeading section={SECTIONS['real-sample']} />
        <JoinButton start="agency-sample">Request a real sample</JoinButton>
      </div>
    </HomeSectionShell>
  );
}
