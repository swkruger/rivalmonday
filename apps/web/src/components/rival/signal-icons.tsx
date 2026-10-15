/** Hand-written 12px icon for the rating pill; it inherits the pill's text colour. The other pills are text-first. */
const base = { width: 12, height: 12, viewBox: '0 0 16 16', 'aria-hidden': true } as const;

export const StarIcon = () => (
  <svg {...base} fill="currentColor" stroke="none">
    <path d="M8 1.2l2.1 4.5 4.9.6-3.6 3.4.9 4.9L8 12.2 3.7 14.6l.9-4.9L1 6.3l4.9-.6z" />
  </svg>
);
