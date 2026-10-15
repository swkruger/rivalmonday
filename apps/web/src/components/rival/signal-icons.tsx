/** Hand-written 12px icons for the signal pills; they inherit the pill's text colour. */
const base = { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

export const StarIcon = () => (
  <svg {...base} fill="currentColor" stroke="none">
    <path d="M8 1.2l2.1 4.5 4.9.6-3.6 3.4.9 4.9L8 12.2 3.7 14.6l.9-4.9L1 6.3l4.9-.6z" />
  </svg>
);
export const ReviewsIcon = () => (
  <svg {...base}>
    <path d="M2 3.5h12v7H8.5L5 13.5v-3H2z" />
  </svg>
);
export const AdsIcon = () => (
  <svg {...base}>
    <path d="M2 6.5v3h2.5L10 12.5v-9L4.5 6.5zM12.5 6a3 3 0 010 4" />
  </svg>
);
export const MetaIcon = () => (
  <svg {...base}>
    <path d="M2 11.5c0-4 2-7 3.6-7S8 8 8 8s.8 3.5 2.4 3.5C12 11.5 14 9 14 6.5" />
  </svg>
);
export const SearchesIcon = () => (
  <svg {...base}>
    <circle cx="7" cy="7" r="4.3" />
    <path d="M10.3 10.3L14 14" />
  </svg>
);
export const ChainIcon = () => (
  <svg {...base}>
    <path d="M6.5 9.5l3-3M5 8L3.8 9.2a2.4 2.4 0 003.4 3.4L8.4 11.4M11 8l1.2-1.2a2.4 2.4 0 00-3.4-3.4L7.6 4.6" />
  </svg>
);
export const SpecialtyIcon = () => (
  <svg {...base}>
    <path d="M3 5.5h9.5M10 3l2.5 2.5L10 8M13 10.5H3.5M6 8l-2.5 2.5L6 13" />
  </svg>
);
