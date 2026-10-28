/** Step 4 illustration: the first two weeks, from first client to first Monday brief. Static. */
export function Timeline() {
  return (
    <svg role="img" aria-label="Your first two weeks: add a client today, a starting point within 48 hours, then a brief every Monday" width="400" viewBox="0 0 560 460" fontFamily="Inter, sans-serif" className="max-w-full">
      <line className="stroke-line" x1="80" y1="70" x2="80" y2="390" strokeWidth="2" strokeDasharray="4 6" />
      <circle className="fill-primary" cx="80" cy="70" r="16" />
      <text className="fill-ink" x="80" y="75" textAnchor="middle" fontSize="13" fontWeight="600">1</text>
      <rect className="fill-surface stroke-line" x="120" y="40" width="380" height="64" rx="8" />
      <rect className="fill-muted-surface" x="136" y="56" width="32" height="32" rx="6" />
      <text className="fill-ink" x="182" y="68" fontSize="13" fontWeight="600">Cool Breeze Heating &amp; Air</text>
      <text className="fill-muted-ink" x="182" y="86" fontSize="12">Today · client added</text>
      <circle className="fill-primary-soft" cx="80" cy="230" r="16" />
      <text className="fill-primary-soft-text" x="80" y="235" textAnchor="middle" fontSize="13" fontWeight="600">2</text>
      <rect className="fill-surface stroke-line" x="120" y="190" width="380" height="80" rx="8" />
      <text className="fill-ink" x="136" y="214" fontSize="13" fontWeight="600">Starting point</text>
      <text className="fill-muted-ink" x="136" y="232" fontSize="12">Within 48 hours</text>
      <rect className="fill-secondary" x="136" y="244" width="110" height="8" rx="4" />
      <rect className="fill-warning" x="252" y="244" width="140" height="8" rx="4" />
      <rect className="fill-line-control" x="398" y="244" width="80" height="8" rx="4" />
      <circle className="fill-primary-soft" cx="80" cy="390" r="16" />
      <text className="fill-primary-soft-text" x="80" y="395" textAnchor="middle" fontSize="13" fontWeight="600">3</text>
      <rect className="fill-surface stroke-line" x="120" y="350" width="380" height="80" rx="8" />
      <text className="fill-ink" x="136" y="374" fontSize="13" fontWeight="600">Monday brief</text>
      <text className="fill-muted-ink" x="136" y="392" fontSize="12">Every week, approved by you</text>
      <rect className="fill-muted-surface" x="136" y="404" width="300" height="7" rx="3.5" />
      <rect className="fill-muted-surface" x="136" y="416" width="220" height="7" rx="3.5" />
    </svg>
  );
}
