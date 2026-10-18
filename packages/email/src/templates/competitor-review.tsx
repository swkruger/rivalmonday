/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Text } from 'react-email';
import { button, Layout } from '../layout';
import type { CompetitorReviewProps } from '../types';

/** Phase 11b Task 18 (copy is binding, spec §6). Names only; capped at 5. No "Rival Monday". */
export const COMPETITOR_REVIEW_MAX_NAMES = 5;

export const competitorReviewSubject = (p: Pick<CompetitorReviewProps, 'businessName'>) => `Review the competitors we found for ${p.businessName}`;

export function CompetitorReviewEmail(p: CompetitorReviewProps) {
  const subject = competitorReviewSubject(p);
  const names = p.competitorNames.slice(0, COMPETITOR_REVIEW_MAX_NAMES);
  return (
    <Layout branding={p.branding} title={subject} preview={subject} footer={`Sent by ${p.branding.displayName}`}>
      <Text style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>{subject}</Text>
      <Text>We found these businesses competing with you:</Text>
      <ul>
        {names.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
      <Text>Tick the ones you want us to watch and untick any that aren't real competitors.</Text>
      <Button href={p.reviewUrl} style={button(p.branding)}>
        Review competitors
      </Button>
    </Layout>
  );
}
