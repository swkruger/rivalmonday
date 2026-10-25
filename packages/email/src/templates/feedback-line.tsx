/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Link, Text } from 'react-email';
import type { FeedbackContact } from '../types';

/** `mailto:` with a `Feedback: {subject}` subject line. */
export const feedbackMailto = (email: string, subject: string) => `mailto:${email}?subject=${encodeURIComponent(`Feedback: ${subject}`)}`;

/**
 * 7c2 (spec §5, decided copy): the client's way to write to their agency from a brief or alert email. White label: it
 * names the agency contact (or "your agency"), never the platform. Renders nothing without a contact. The text part shows
 * the address only (`data-text-only-link`, see `TEXT_ONLY_LINK` in render.ts), so it reads as the decided sentence.
 */
export function FeedbackLine({ feedback, subject }: { feedback: FeedbackContact | null | undefined; subject: string }) {
  if (!feedback) return null;
  const who = feedback.name?.trim() || 'your agency';
  return (
    <Text style={{ marginTop: 16, fontSize: 13, color: '#5B6B7F' }}>
      {`Something look off? Reply to this email or write to ${who} at `}
      <Link href={feedbackMailto(feedback.email, subject)} data-text-only-link="true">{feedback.email}</Link>.
    </Text>
  );
}
