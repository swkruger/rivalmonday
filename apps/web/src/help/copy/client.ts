import type { HelpAudience } from '@cs/core';

export type PageKey = 'client.overview' | 'client.changes' | 'client.reviews'; // 15b-2 extends
export interface Tip { title: string; body: string; audience?: HelpAudience; guideAnchor?: string }
export interface EmptyCopy { title: string; body: string; audience?: HelpAudience }
export interface PageCopy { description: string; tips?: Record<string, Tip>; empty?: Record<string, EmptyCopy> }

/** Short in-page help copy. `{agency}`, `{assistant}` and `{client}` are filled by `renderCopy`. */
// TODO(Task 9): placeholder copy, replaced by the real page copy. Nothing renders these on a real page yet.
export const PAGE_COPY = {
  'client.overview': {
    description: 'Placeholder overview description.',
    tips: { placeholder: { title: 'Placeholder tip', body: 'Placeholder tip body for {client}.' } },
    empty: { placeholder: { title: 'Nothing here yet', body: 'Placeholder empty state.' } },
  },
  'client.changes': {
    description: 'Placeholder changes description.',
    tips: { placeholder: { title: 'Placeholder tip', body: 'Placeholder tip body.' } },
  },
  'client.reviews': {
    description: 'Placeholder reviews description.',
    tips: { placeholder: { title: 'Placeholder tip', body: 'Placeholder tip body.' } },
  },
} as const satisfies Record<PageKey, PageCopy>;
