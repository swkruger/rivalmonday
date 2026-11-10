import { CHOOSER } from '../../../content/chooser';
import { Doors } from './doors';
import { HomeSectionShell } from './section-heading';

/** The chooser again lower on the page, for readers who scrolled past the hero. */
export function DoorsBand() {
  return (
    <HomeSectionShell id="choose" labelledBy="choose-heading">
      <div className="mx-auto max-w-3xl text-center">
        <h2 id="choose-heading" className="text-section font-semibold text-ink">
          {CHOOSER.bandHeading}
        </h2>
        <div className="mt-8 text-left">
          <Doors headingId="choose-heading" />
        </div>
      </div>
    </HomeSectionShell>
  );
}
