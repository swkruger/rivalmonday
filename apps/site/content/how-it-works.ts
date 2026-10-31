export const HOW_IT_WORKS = {
  h1: 'How Rival Monday works',
  lead: 'From adding a client to the brief that lands every Monday, and how every claim in it gets checked on the way.',
  title: 'The checks, step by step',
  sections: [
    {
      heading: '1. We capture the evidence',
      body: 'Everything starts with a record of what was public. We save website snapshots with their date and URL, reviews and ads as they appeared, and map rankings from a grid of points across the service area. Nothing is remembered from elsewhere or filled in later.',
    },
    {
      heading: '2. We write only from the evidence',
      body: 'The writing step sees the changes we captured, never the open web. It cannot pull in a fact we have no record of. Each sentence in a brief names the source it came from.',
    },
    {
      heading: '3. A second check reads every claim',
      body: 'A separate verifier compares each claim with its evidence. A claim that falls below the bar is dropped, not softened. Your team can edit or approve each brief before it is sent.',
    },
    {
      heading: '4. You can always click through',
      body: 'The brief, the dashboard and Friday all link back to the evidence. Open any claim and see the snapshot, review, ad or ranking behind it, so you can stand behind it with your client.',
    },
    {
      heading: "What we don't do",
      body: "We don't guess at private data, and we don't publish a claim without a source. We don't evade website rules either: we identify our crawler and respect each site's robots.txt.",
    },
  ],
} as const;
