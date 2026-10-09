import type { Rng } from './random';

/** The 8 `hvac_plumbing` pack themes (reviews.test.ts checks them against the pack). */
export const HVAC_THEMES = ['response_time', 'price_transparency', 'technician_professionalism', 'upsell_pressure', 'scheduling', 'fix_quality', 'communication', 'cleanliness'] as const;
export type HvacTheme = (typeof HVAC_THEMES)[number];

/** Spec §4.5: searchable in at least one review. */
export const LATE_PHRASE = 'showed up two hours late';

export const FIRST_NAMES = ['James', 'Maria', 'Robert', 'Linda', 'Michael', 'Patricia', 'David', 'Jennifer', 'Carlos', 'Elizabeth', 'Daniel', 'Susan', 'Jose', 'Karen', 'Thomas', 'Nancy', 'Kevin', 'Lisa', 'Brian', 'Sandra', 'Luis', 'Ashley', 'Tyler', 'Megan', 'Ryan', 'Brenda', 'Jason', 'Amber', 'Eric', 'Rachel'] as const;
export const LAST_INITIALS = 'ABCDEFGHJKLMNPRSTW'.split('');

export const REVIEW_PHRASES: Record<HvacTheme, { pos: readonly string[]; neg: readonly string[] }> = {
  response_time: { pos: ['They answered right away and had someone out the same afternoon.', 'Called at 8am and the tech was here by 10.'], neg: ['Took three days just to get a call back.', 'Waited all day for someone to show.'] },
  price_transparency: { pos: ['Gave us the price upfront, no surprises on the bill.', 'The quote matched the final invoice exactly.'], neg: ['The final bill had fees nobody mentioned.', 'The price doubled once the work started.'] },
  technician_professionalism: { pos: ['The technician was polite and clearly knew his stuff.', 'Very professional crew, explained everything.'], neg: ['The tech was rude and in a hurry.', 'Did not seem to know what he was doing.'] },
  upsell_pressure: { pos: ['No pressure to buy anything we did not need.', 'He fixed the part instead of pushing a new unit.'], neg: ['Kept pushing a whole new system on us.', 'Felt like a sales pitch for their membership.'] },
  scheduling: { pos: ['Arrived right at the start of the window.', 'Easy to book online and they kept the appointment.'], neg: ['Rescheduled on us twice.', 'Nobody came during the window they gave us.'] },
  fix_quality: { pos: ['Fixed it the first time and it has run great since.', 'Problem solved, the house is cool again.'], neg: ['The same problem came back a week later.', 'Had to call them out again for the same leak.'] },
  communication: { pos: ['Texted updates the whole way.', 'Explained the options clearly before starting.'], neg: ['Never told us what was going on.', 'No follow-up after the visit.'] },
  cleanliness: { pos: ['Wore shoe covers and cleaned up after.', 'Left the attic cleaner than they found it.'], neg: ['Left a mess in the garage.', 'Tracked mud through the house.'] },
};

const OPEN_POS = ['Great experience.', 'Highly recommend.', 'Will use them again.', 'Five stars from us.'];
const OPEN_NEG = ['Disappointed.', 'Not happy.', 'Would not recommend.', 'Frustrating visit.'];
const OPEN_MID = ['It was fine overall.', 'Okay service.', 'Mixed experience.'];

/** 4–5 stars: positive phrases; 1–2: negative; 3: one of each. */
export function reviewText(rng: Rng, rating: number, themes: readonly HvacTheme[]): string {
  const parts = [rating >= 4 ? rng.pick(OPEN_POS) : rating <= 2 ? rng.pick(OPEN_NEG) : rng.pick(OPEN_MID)];
  themes.forEach((t, i) => {
    const tone = rating >= 4 ? 'pos' : rating <= 2 ? 'neg' : i === 0 ? 'neg' : 'pos';
    parts.push(rng.pick(REVIEW_PHRASES[t][tone]));
  });
  return parts.join(' ');
}

export const OWNER_ANSWERS = [
  'Thank you for choosing us! We appreciate the kind words.',
  'Thanks for the feedback. We are glad we could help.',
  'We are sorry about this. Please call our office so we can make it right.',
] as const;
