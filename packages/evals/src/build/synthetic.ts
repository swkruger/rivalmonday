import { buildReviewState, diffFacts, extractNumericFacts, otherKey, themeKey } from '@cs/engine';
import type { EvalCase } from '../case';
import { evalPack, labelCase, questionsFor, redactDeep, type ReviewInput } from './common';
import { changeInput } from './golden';

/**
 * Decision 11: template-generated dental data. Seeded RNG + phrase banks; each template's label is known by construction,
 * so the pre-label only cross-checks it. No generation spend.
 */
const VERTICAL = 'dental';

/** mulberry32: small, fast, deterministic. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rand = () => number;
const pick = <T>(r: Rand, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
const int = (r: Rand, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

const PRACTICES = ['Lakeside Family Dental', 'Maple Grove Dentistry', 'Cedar Park Smiles', 'Riverbend Dental Care', 'Summit Dental Studio', 'Oak Hollow Dental'];
const TOWNS = ['Frisco', 'Plano', 'McKinney', 'Prosper', 'Little Elm', 'Wylie', 'Sachse', 'Denton', 'Lewisville', 'Carrollton']; // none read as a person name by redactForModel
const ROLES = ['dental hygienist', 'dental assistant', 'front desk coordinator', 'associate dentist', 'treatment coordinator'];
const INSURERS = ['Delta Dental', 'Cigna', 'MetLife', 'Aetna', 'Guardian'];
const towns = (r: Rand, n: number) => [...new Set(Array.from({ length: n * 2 }, () => pick(r, TOWNS)))].slice(0, n);

// ---------------------------------------------------------------- changes

export interface ChangeTemplate {
  id: string;
  label: Record<string, string>;
  gen(r: Rand, practice: string): { kind: 'added' | 'removed' | 'modified'; before: string | null; after: string | null };
}
const lab = (meaningful: boolean, changeType: string, service = 'none') => ({ meaningful: String(meaningful), change_type: changeType, [`service_${VERTICAL}`]: service });

export const CHANGE_TEMPLATES: ChangeTemplate[] = [
  { id: 'cleaning_price_cut', label: lab(true, 'price_change', 'cleaning_exam'), gen: (r) => {
    const was = int(r, 120, 220);
    const now = was - int(r, 10, 60);
    return { kind: 'modified', before: `Cleaning and exam: $${was} without insurance.`, after: `Cleaning and exam: $${now} without insurance.` };
  } },
  { id: 'whitening_price_rise', label: lab(true, 'price_change', 'whitening'), gen: (r) => {
    const was = int(r, 199, 399);
    return { kind: 'modified', before: `Professional teeth whitening $${was}`, after: `Professional teeth whitening $${was + int(r, 20, 100)}` };
  } },
  { id: 'implant_price_appears', label: lab(true, 'price_change', 'implants'), gen: (r) => ({
    kind: 'modified', before: 'Dental implants that look and feel natural.', after: `Dental implants that look and feel natural, starting at $${int(r, 18, 45)}00.`,
  }) },
  { id: 'new_patient_offer', label: lab(true, 'promo', 'new_patient_special'), gen: (r) => ({
    kind: 'added', before: null, after: `New patient special: exam, X-rays and cleaning for $${pick(r, [49, 59, 79, 99])}. Book online today.`,
  }) },
  { id: 'cosmetic_discount', label: lab(true, 'promo'), gen: (r) => ({
    kind: 'added', before: null, after: `Save ${pick(r, [10, 15, 20, 25])}% on all treatment this ${pick(r, ['month', 'spring', 'fall'])} for first responders and teachers.`,
  }) },
  { id: 'aligner_financing', label: lab(true, 'promo', 'invisalign'), gen: (r) => ({
    kind: 'added', before: null, after: `Invisalign with 0% financing for ${pick(r, [12, 18, 24])} months. Free consultation.`,
  }) },
  { id: 'veneers_added', label: lab(true, 'new_service', 'veneers'), gen: (r) => ({
    kind: 'added', before: null, after: `Now offering porcelain veneers at our ${pick(r, TOWNS)} office.`,
  }) },
  { id: 'sedation_added', label: lab(true, 'new_service', 'sedation'), gen: (r) => ({
    kind: 'added', before: null, after: `${pick(r, ['New', 'Introducing'])}: sedation dentistry for anxious patients, including nitrous oxide.`,
  }) },
  { id: 'kids_added', label: lab(true, 'new_service', 'pediatric'), gen: (r) => ({
    kind: 'added', before: null, after: `We now see children of all ages. Pediatric dentistry ${pick(r, ['is here', 'has arrived', 'now available'])} for your whole family.`,
  }) },
  { id: 'dentures_dropped', label: lab(true, 'service_removed', 'dentures'), gen: (r) => ({
    kind: 'removed', before: `Dentures and partials${pick(r, ['', ' with same-week fittings', ', fitted in house'])}.`, after: null,
  }) },
  { id: 'root_canal_referred', label: lab(true, 'service_removed', 'root_canal'), gen: () => ({
    kind: 'modified', before: 'Root canal therapy in our office.', after: 'Root canal therapy is no longer offered here; we refer patients to a specialist.',
  }) },
  { id: 'area_expanded', label: lab(true, 'service_area_change'), gen: (r) => ({ kind: 'added', before: null, after: `Now serving ${towns(r, 3).join(', ')} and nearby communities.` }) },
  { id: 'second_office', label: lab(true, 'new_location'), gen: (r) => ({ kind: 'added', before: null, after: `Our new ${pick(r, TOWNS)} office is now open and accepting patients.` }) },
  { id: 'hiring_post', label: lab(true, 'hiring'), gen: (r) => ({ kind: 'added', before: null, after: `We are hiring a full-time ${pick(r, ROLES)}. Apply today.` }) },
  { id: 'insurance_network', label: lab(true, 'content'), gen: (r) => ({ kind: 'modified', before: 'We accept most PPO dental plans.', after: `We are now in-network with ${pick(r, INSURERS)} and most PPO dental plans.` }) },
  { id: 'saturday_hours', label: lab(true, 'content'), gen: (r) => ({
    kind: 'modified', before: 'Open Monday through Friday.', after: `Open Monday through Saturday, until ${pick(r, ['6', '7', '8'])} pm on weekdays.`,
  }) },
  { id: 'testimonial_tweak', label: lab(false, 'cosmetic'), gen: (r) => {
    const t = pick(r, ['Best dental visit I have had', 'Everyone was so kind', 'Painless and quick']);
    return { kind: 'modified', before: `"${t}."`, after: `"${t}!"` };
  } },
  { id: 'welcome_reworded', label: lab(false, 'cosmetic'), gen: (r, practice) => ({
    kind: 'modified', before: `Welcome to ${practice}, where your smile comes first.`, after: `${pick(r, ['Welcome', 'Hello and welcome'])} to ${practice}: your smile always comes first.`,
  }) },
  { id: 'copyright_year', label: lab(false, 'cosmetic'), gen: (_r, practice) => ({ kind: 'modified', before: `© 2025 ${practice}. All rights reserved.`, after: `© 2026 ${practice}. All rights reserved.` }) },
];

// ---------------------------------------------------------------- reviews

type Polarity = 'pos' | 'neg';
export interface ReviewTemplate {
  id: string;
  topics: Partial<Record<string, Polarity>>;
  /** Index into SENTIMENT_LEVELS (0 very negative … 4 very positive). */
  sentiment: number;
  rating: number;
  /** The review raises an aspect no topic covers. */
  other?: string[];
}

const SENTENCES: Record<string, Record<Polarity, string[]>> = {
  wait_time: {
    pos: ['I was called back right at my appointment time.', 'No waiting at all, they took me on time.'],
    neg: ['I waited over 45 minutes past my appointment time.', 'Sat in the waiting room for almost an hour before anyone called me back.', 'They always run late and you end up waiting forever.'],
  },
  billing_insurance: {
    pos: ['They explained exactly what insurance would cover before starting.', 'Billing was clear and matched the estimate.'],
    neg: ['I got a surprise bill weeks later that insurance should have covered.', 'The front office could not explain my charges and billed my insurance wrong.', 'The estimate was nothing like the final bill.'],
  },
  staff_friendliness: {
    pos: ['The front desk team was warm and welcoming.', 'Everyone from the receptionist to the hygienist was so kind.', 'The staff are friendly and genuinely helpful.'],
    neg: ['The receptionist was rude and dismissive.', 'Staff seemed annoyed that I had questions.'],
  },
  pain_comfort: {
    pos: ['The dentist was incredibly gentle and I felt no pain.', 'They kept checking that I was comfortable, which helped my anxiety.'],
    neg: ['The cleaning was rough and my gums hurt for days.', 'They ignored me when I said the numbing had not worked.'],
  },
  upsell_pressure: {
    pos: ['They never pushed treatment I did not need.'],
    neg: ['They kept pushing expensive cosmetic work I never asked for.', 'Felt like a sales pitch for veneers and a pricey treatment plan.', 'Every visit they try to sell me something new.'],
  },
  appointment_availability: {
    pos: ['I got an appointment the same week.', 'Booking online was easy and they had openings right away.'],
    neg: ['The earliest appointment was two months out.', 'Impossible to get an appointment that works.'],
  },
  results_quality: {
    pos: ['My crown looks completely natural.', 'The whitening results were amazing.', 'My new filling feels perfect.'],
    neg: ['My crown fell off after a month.', 'The filling cracked within weeks.'],
  },
  cleanliness: {
    pos: ['The office is spotless and modern.', 'Everything was very clean and sanitized.'],
    neg: ['The exam room was dirty and cluttered.'],
  },
};
const OTHER_SENTENCES: Record<string, string[]> = {
  parking: ['Parking is a nightmare, there are only four spots.', 'Finding parking near the office took twenty minutes.'],
  music: ['The music in the office was way too loud.'],
};

export const REVIEW_TEMPLATES: ReviewTemplate[] = [
  { id: 'long_wait', topics: { wait_time: 'neg' }, sentiment: 1, rating: 2 },
  { id: 'surprise_bill', topics: { billing_insurance: 'neg' }, sentiment: 0, rating: 1 },
  { id: 'kind_staff', topics: { staff_friendliness: 'pos' }, sentiment: 4, rating: 5 },
  { id: 'gentle_dentist', topics: { pain_comfort: 'pos' }, sentiment: 4, rating: 5 },
  { id: 'pushy_upsell', topics: { upsell_pressure: 'neg' }, sentiment: 1, rating: 2 },
  { id: 'quick_booking', topics: { appointment_availability: 'pos' }, sentiment: 3, rating: 4 },
  { id: 'great_results', topics: { results_quality: 'pos' }, sentiment: 4, rating: 5 },
  { id: 'spotless_office', topics: { cleanliness: 'pos' }, sentiment: 3, rating: 5 },
  { id: 'nice_staff_slow', topics: { staff_friendliness: 'pos', wait_time: 'neg' }, sentiment: 2, rating: 3 },
  { id: 'billing_vs_results', topics: { billing_insurance: 'neg', results_quality: 'pos' }, sentiment: 2, rating: 3 },
  { id: 'painful_and_pushy', topics: { pain_comfort: 'neg', upsell_pressure: 'neg' }, sentiment: 0, rating: 1 },
  { id: 'parking_gripe', topics: {}, other: ['parking'], sentiment: 2, rating: 3 },
];

export function reviewTemplateLabel(t: ReviewTemplate): Record<string, string> {
  const pack = evalPack(VERTICAL);
  return {
    sentiment: String(t.sentiment),
    ...Object.fromEntries(pack.topics.map((topic) => [themeKey(VERTICAL, topic.id), String(t.topics[topic.id] !== undefined)])),
    [otherKey(VERTICAL)]: String((t.other ?? []).length > 0),
  };
}

function reviewText(r: Rand, t: ReviewTemplate, practice: string): string {
  const parts = [
    ...Object.entries(t.topics).map(([topic, pol]) => pick(r, SENTENCES[topic]![pol!])),
    ...(t.other ?? []).map((o) => pick(r, OTHER_SENTENCES[o]!)),
  ];
  // Neutral framing only: never a topic of its own.
  const intro = pick(r, ['', `Visited ${practice} for a checkup. `, 'First visit here. ', `Been going to ${practice} for a while. `]);
  return `${intro}${parts.join(' ')}`;
}

// ---------------------------------------------------------------- build

const caseId = (suite: string, templateId: string, i: number) => `${suite}-syn-${templateId.replace(/_/g, '-')}-${String(i).padStart(3, '0')}`;

/** n cases, templates round-robin, wording drawn from the seeded RNG. */
export function buildSynthetic(suite: 'changes' | 'reviews', n: number, seed: number): EvalCase[] {
  const r = rng(seed);
  const out: EvalCase[] = [];
  for (let i = 0; i < n; i++) {
    const practice = pick(r, PRACTICES);
    if (suite === 'changes') {
      const t = CHANGE_TEMPLATES[i % CHANGE_TEMPLATES.length]!;
      const g = t.gen(r, practice);
      const input = changeInput({ verticalIds: [VERTICAL], competitorName: practice, pageUrl: null, pageType: pick(r, ['home', 'services', 'specials', 'about']) }, {
        kind: g.kind, beforeText: g.before, afterText: g.after, numericChanges: diffNumeric(g.before, g.after),
      });
      out.push(labelCase('changes', caseId('changes', t.id, i), 'synthetic', input, { ...t.label }, 'template'));
    } else {
      const t = REVIEW_TEMPLATES[i % REVIEW_TEMPLATES.length]!;
      const verticalIds = [VERTICAL];
      const state = buildReviewState({ businessTypes: [evalPack(VERTICAL).name], rating: t.rating, text: reviewText(r, t, practice), competitorName: practice });
      const input: ReviewInput = { state: redactDeep(state, [practice]), verticalIds, questionKeys: Object.keys(questionsFor('reviews', verticalIds)) };
      out.push(labelCase('reviews', caseId('reviews', t.id, i), 'synthetic', input, reviewTemplateLabel(t), 'template'));
    }
  }
  return out;
}

const diffNumeric = (before: string | null, after: string | null) => diffFacts(before ? extractNumericFacts(before) : [], after ? extractNumericFacts(after) : []);
