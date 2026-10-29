/**
 * Friday's canned answers on the sample brief (plan P4, owner signs). Written from `sample-brief.json`: every part
 * that states a figure cites the evidence it came from, and the figure must appear in that evidence itself
 * (`sample-friday.test.ts`; item text does not count: no evidence, no claim).
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
    question: 'What changed with Quillstone Climate Pros?',
    answer: [
      { text: "In last week's map scan for \"ac repair marlowemere\", Quillstone Climate Pros ranked in the top 3 at 31 of 49 points.", cite: 'e1' },
      { text: ' It also started Meta ads. One offers 0% financing for 60 months on new systems,', cite: 'e3' },
      { text: ' another a Comfort Club with two tune-ups a year and 15% off repairs.', cite: 'e4' },
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
      { text: ' The rival to watch is Quillstone Climate Pros: in the scan a week earlier it ranked in the top 3 at 31 of 49 points.', cite: 'e1' },
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
