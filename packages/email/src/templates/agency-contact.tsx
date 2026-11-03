/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Link, Section, Text } from '../rx';
import type { Branding } from '../branding';

const LINE = { margin: 0, fontSize: 14, color: '#5B6B7F' };

/**
 * How a client reaches their agency, in the shape onboarding previews ("how you appear at the bottom of every client
 * brief"). Client-facing emails only, never the PDF variant. Renders nothing without contact details. The text part shows
 * the address only (`data-text-only-link`, see `TEXT_ONLY_LINK` in render.ts).
 */
export function AgencyContactBlock({ branding }: { branding: Branding }) {
  const c = branding.contact;
  if (!c) return null;
  return (
    <Section style={{ borderTop: '1px solid #E2E8F0', marginTop: 24, paddingTop: 16 }}>
      <Text style={{ ...LINE, fontWeight: 600, color: branding.ink }}>Questions? Get in touch:</Text>
      <Text style={LINE}>{[c.name, branding.displayName].filter(Boolean).join(' · ')}</Text>
      {c.phone || c.email ? (
        <Text style={LINE}>
          {c.phone}
          {c.phone && c.email ? ' · ' : ''}
          {c.email ? <Link href={`mailto:${c.email}`} data-text-only-link="true">{c.email}</Link> : null}
        </Text>
      ) : null}
      {c.address ? <Text style={LINE}>{c.address}</Text> : null}
    </Section>
  );
}
