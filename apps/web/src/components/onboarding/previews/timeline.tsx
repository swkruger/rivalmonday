/** Step 4 illustration: the first two weeks, from first client to first Monday brief. Static. */
export function Timeline() {
  return (
    <svg role="img" aria-label="Your first two weeks: add a client today, a starting point within 48 hours, then a brief every Monday" width="400" viewBox="0 0 560 460" fontFamily="Inter, sans-serif" className="max-w-full">
      <line x1="80" y1="70" x2="80" y2="390" stroke="#DDE4EC" strokeWidth="2" strokeDasharray="4 6" />
      <circle cx="80" cy="70" r="16" fill="#47A8E7" />
      <text x="80" y="75" textAnchor="middle" fontSize="13" fontWeight="600" fill="#0B2540">1</text>
      <rect x="120" y="40" width="380" height="64" rx="8" fill="#fff" stroke="#DDE4EC" />
      <rect x="136" y="56" width="32" height="32" rx="6" fill="#EEF2F6" />
      <text x="182" y="68" fontSize="13" fontWeight="600" fill="#0B2540">Cool Breeze Heating &amp; Air</text>
      <text x="182" y="86" fontSize="12" fill="#5B6B80">Today · client added</text>
      <circle cx="80" cy="230" r="16" fill="#E6F3FC" />
      <text x="80" y="235" textAnchor="middle" fontSize="13" fontWeight="600" fill="#174E7A">2</text>
      <rect x="120" y="190" width="380" height="80" rx="8" fill="#fff" stroke="#DDE4EC" />
      <text x="136" y="214" fontSize="13" fontWeight="600" fill="#0B2540">Starting point</text>
      <text x="136" y="232" fontSize="12" fill="#5B6B80">Within 48 hours</text>
      <rect x="136" y="244" width="110" height="8" rx="4" fill="#2A6BAC" />
      <rect x="252" y="244" width="140" height="8" rx="4" fill="#F5A524" />
      <rect x="398" y="244" width="80" height="8" rx="4" fill="#C9D3DE" />
      <circle cx="80" cy="390" r="16" fill="#E6F3FC" />
      <text x="80" y="395" textAnchor="middle" fontSize="13" fontWeight="600" fill="#174E7A">3</text>
      <rect x="120" y="350" width="380" height="80" rx="8" fill="#fff" stroke="#DDE4EC" />
      <text x="136" y="374" fontSize="13" fontWeight="600" fill="#0B2540">Monday brief</text>
      <text x="136" y="392" fontSize="12" fill="#5B6B80">Every week, approved by you</text>
      <rect x="136" y="404" width="300" height="7" rx="3.5" fill="#EEF2F6" />
      <rect x="136" y="416" width="220" height="7" rx="3.5" fill="#EEF2F6" />
    </svg>
  );
}
