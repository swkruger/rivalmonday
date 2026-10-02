import { describe, expect, it } from 'vitest';
import { parseVerticalPack } from './loader';

const weights = `
    price_change: 1
    promo: 0.8
    new_service: 0.7
    service_removed: 0.5
    service_area_change: 0.9
    new_location: 0.9
    hiring: 0.5
    ad_started: 0.6
    ad_stopped: 0.3
    review_spike: 0.6
    rating_change: 0.7
    content: 0.2
    cosmetic: 0`;

const valid = `
id: test_pack
name: Test
version: 1
services:
  - { id: tune_up, name: Tune-up, aliases: [tuneup] }
  - { id: repair, name: Repair }
themes:
  - { id: response_time, name: Response time, description: How fast they respond }
type_weights:${weights}
move_thresholds:
  hiring_push_postings_30d: 3
  rating_drop_90d: 0.3
  ad_surge_multiplier: 2
  complaint_spike_multiplier: 2
playbooks:
  - id: price_cut_bundle
    trigger: price_change
    title: Answer a price cut with a bundle
    template: Offer {{service}} bundled with a value add instead of matching {{competitor}}.
`;

describe('parseVerticalPack', () => {
  it('parses a valid pack and applies defaults', () => {
    const pack = parseVerticalPack(valid, 'test.yaml');
    expect(pack.services[1]?.aliases).toEqual([]);
    expect(pack.type_weights.price_change).toBe(1);
  });

  it('applies scoring defaults when a pack omits the scoring section', () => {
    const pack = parseVerticalPack(valid, 'test.yaml');
    expect(pack.scoring).toMatchObject({ version: 1, routing: { alert: 70, brief: 40 }, novelty_similarity_floor: 0.5, novelty_window_days: 365 });
  });

  it('rejects routing where brief is not below alert', () => {
    const bad = `${valid}scoring:\n  routing: { alert: 40, brief: 70 }\n`;
    expect(() => parseVerticalPack(bad, 'bad.yaml')).toThrow(/routing\.brief must be below routing\.alert/);
  });

  it('rejects a missing change-type weight, naming the file and path', () => {
    const broken = valid.replace('    cosmetic: 0', '');
    expect(() => parseVerticalPack(broken, 'broken.yaml')).toThrow(/broken\.yaml[\s\S]*type_weights[\s\S]*cosmetic/);
  });

  it('rejects unknown change types and out-of-range weights', () => {
    expect(() => parseVerticalPack(valid.replace('promo: 0.8', 'promo: 0.8\n    teleport: 1'), 'x.yaml')).toThrow(/teleport/);
    expect(() => parseVerticalPack(valid.replace('promo: 0.8', 'promo: 1.8'), 'x.yaml')).toThrow(/promo/);
  });

  it('rejects duplicate ids and unknown playbook triggers', () => {
    expect(() => parseVerticalPack(valid.replace('id: repair', 'id: tune_up'), 'x.yaml')).toThrow(/duplicate/i);
    expect(() => parseVerticalPack(valid.replace('trigger: price_change', 'trigger: sale'), 'x.yaml')).toThrow(/trigger/);
  });
});
