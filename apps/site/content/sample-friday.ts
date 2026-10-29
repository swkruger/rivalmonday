/**
 * Friday's canned answers on the sample brief (plan P4, owner signs). Written from `sample-brief.json`: every part
 * that states a figure cites the evidence it came from (`sample-friday.test.ts` fails on any uncited number).
 * No network, no model: the site plays these back as typed text.
 */
export interface CannedAnswer {
  id: string;
  question: string;
  answer: { text: string; cite?: string /* evidence id */ }[];
}

export const FRIDAY_ANSWERS: readonly CannedAnswer[] = [
  {
    id: 'quillstone-week',
    question: 'What changed with Quillstone Climate Pros this week?',
    answer: [
      { text: 'Quillstone Climate Pros moved up on the map for "ac repair marlowemere": it now ranks in the top 3 at 31 of 49 points, up from 8 of 49.', cite: 'e1' },
      { text: ' It also started 2 Meta ads. One offers 0% financing for 60 months on new systems,', cite: 'e3' },
      { text: ' the other a Comfort Club with two tune-ups a year and 15% off repairs.', cite: 'e4' },
    ],
  },
  {
    id: 'kestrel-price',
    question: "Should we match Kestrel Mechanical's price?",
    answer: [
      { text: 'Kestrel Mechanical cut its AC repair diagnostic from $89 to $69.', cite: 'e2' },
      { text: ' Rather than match it, promote a value bundle: price-sensitive customers in your area compare these prices before they book.', cite: 'e2' },
    ],
  },
  {
    id: 'map-leader',
    question: 'Who is winning the map for "ac repair marlowemere"?',
    answer: [
      { text: 'In the latest scan you are in the map top 3 at 42 of 49 points.', cite: 'e17' },
      { text: ' The rival to watch is Quillstone Climate Pros: it is now in the top 3 at 31 of 49 points, up from 8.', cite: 'e1' },
      { text: ' Check your Google Business Profile categories and recent reviews for the areas it took.', cite: 'e1' },
    ],
  },
  {
    id: 'tidewell-service',
    question: 'What did Tidewell Mechanical change on its website?',
    answer: [
      { text: 'Tidewell Mechanical added heat pump installation to its list of services.', cite: 'e5' },
      { text: ' They now compete for a service you offer, so highlight your heat pump experience on your site.', cite: 'e5' },
    ],
  },
];
