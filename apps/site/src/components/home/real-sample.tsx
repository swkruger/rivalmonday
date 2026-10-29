import { SECTIONS } from '../../../content/home';
import { JoinButton } from '../join/join-button';
import { HomeSectionShell, SectionHeading } from './section-heading';

export function RealSample() {
  return (
    <HomeSectionShell id="real-sample" labelledBy="real-sample-heading">
      <div className="flex flex-col items-start gap-6 lg:flex-row lg:items-center lg:justify-between">
        <SectionHeading section={SECTIONS['real-sample']} />
        <JoinButton start="agency-sample">Request a real sample</JoinButton>
      </div>
    </HomeSectionShell>
  );
}
