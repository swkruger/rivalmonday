export interface FounderNote {
  paragraph: string;
  name: string;
  role: string;
  /** `/founder.jpg` in `public/`, or null to show the initials. */
  photo: string | null;
  initials: string;
}

// OWNER-PLACEHOLDER: the owner supplies the note (spec § 9). The section is hidden while this is null.
export const FOUNDER_NOTE: FounderNote | null = null;
