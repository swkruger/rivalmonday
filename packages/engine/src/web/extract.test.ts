import { describe, expect, it } from 'vitest';
import { fixture } from '../../test/seed';
import { extractBlocks, MAX_BLOCK_CHARS, MAX_BLOCKS } from './extract';

const page = (body: string) => `<!doctype html><html><head><title>t</title><style>.x{color:red}</style></head><body>${body}</body></html>`;
const texts = (body: string) => extractBlocks(page(body)).map((b) => b.text);

describe('extractBlocks', () => {
  it('drops scripts, nav, footer, hidden elements and cookie-consent banners', () => {
    expect(texts(`
      <nav><a href="/">Home</a><a href="/about">About</a></nav>
      <div id="onetrust-banner-sdk"><p>We use cookies</p><button>Accept</button></div>
      <h1>AC Repair in Plano</h1>
      <script>var x = 1</script>
      <p hidden>secret</p><div aria-hidden="true">decor</div>
      <footer><p>© 2026 Smith HVAC</p></footer>`)).toEqual(['AC Repair in Plano']);
  });

  it('never lets the consent filter remove the page itself or a wrapper', () => {
    const html = `<!doctype html><html><head><title>t</title></head><body class="home page cookies-not-set"><main><h1>AC Repair in Plano</h1><p>Same-day service</p></main></body></html>`;
    expect(extractBlocks(html).map((b) => b.text)).toEqual(['AC Repair in Plano', 'Same-day service']);
    // A consent-named wrapper holding most of the page is a wrapper, not a banner.
    expect(texts(`<div class="cookie-wrapper"><h1>AC Repair in Plano</h1><p>Same-day service across Collin County</p></div><p>Call us</p>`))
      .toEqual(['AC Repair in Plano', 'Same-day service across Collin County', 'Call us']);
  });

  it('still strips the #cookie-consent banner of the golden fixtures', async () => {
    for (const name of ['hvac-home-v1.html', 'hvac-home-v2.html']) {
      const out = extractBlocks(await fixture(name)).map((b) => b.text);
      expect(out.length).toBeGreaterThan(3);
      expect(out.filter((t) => /cookies/i.test(t))).toEqual([]);
    }
  });

  it('matches consent words as whole class/id segments, not substrings', () => {
    expect(texts(`<div class="cmp-container"><p>AC repair</p></div>`)).toEqual(['AC repair']);
    expect(texts(`<div class="cmp-banner"><p>AC repair</p></div>`)).toEqual(['AC repair']);
    expect(texts(`<section class="trusted-by"><p>Trusted by 10,000 homeowners</p></section>`)).toEqual(['Trusted by 10,000 homeowners']);
    const main = `<h1>AC Repair in Plano</h1><p>Same-day service across Collin County, seven days a week.</p>`;
    for (const banner of [
      '<div class="cc-window cc-banner"><p>This site uses cookies</p></div>',
      '<div class="site-cookie_notice"><p>This site uses cookies</p></div>',
      '<div id="truste-consent-track"><p>This site uses cookies</p></div>',
      '<div id="CybotCookiebotDialog"><p>This site uses cookies</p></div>',
      '<div class="gdpr"><p>This site uses cookies</p></div>',
    ]) expect(texts(banner + main)).toEqual(['AC Repair in Plano', 'Same-day service across Collin County, seven days a week.']);
  });

  it('keeps a header promo bar but not the header nav', () => {
    expect(texts(`<header><div class="promo-bar">$49 off any repair this week</div><nav><a href="/">Home</a></nav></header><p>Welcome</p>`))
      .toEqual(['$49 off any repair this week', 'Welcome']);
  });

  it('treats a link card as one block so a price keeps its service context', () => {
    expect(texts(`<section class="services"><a class="card" href="/tune-up"><h3>AC Tune-Up</h3><p>Only <strong>$89</strong> per system</p></a></section>`))
      .toEqual(['AC Tune-Up Only $89 per system']);
  });

  it('joins inline fragments without inventing spaces', () => {
    expect(texts(`<div class="price"><span>$</span><span>89</span></div>`)).toEqual(['$89']);
  });

  it('captures loose text that sits next to block children', () => {
    expect(texts(`<div class="hero">Limited time! <strong>Book now</strong><p>Call today</p></div>`)).toEqual(['Limited time! Book now', 'Call today']);
  });

  it('builds stable keys from tags and stable classes, ignoring generated classes and positions', () => {
    const blocks = extractBlocks(page(`<ul class="list"><li class="css-1a2b3c item">A</li><li class="item">B</li></ul>`));
    expect(blocks.map((b) => b.blockKey)).toEqual(['ul.list>li.item#0', 'ul.list>li.item#1']);
    expect(blocks.map((b) => b.ord)).toEqual([0, 1]);
  });

  it('gives the same keys to the same structure with different text', () => {
    const a = extractBlocks(page(`<main><p class="lead">Old</p><p class="lead">Two</p></main>`)).map((b) => b.blockKey);
    const b = extractBlocks(page(`<main><p class="lead">New</p><p class="lead">Three</p></main>`)).map((b) => b.blockKey);
    expect(b).toEqual(a);
  });

  it('caps block count and length, and skips punctuation-only blocks', () => {
    expect(extractBlocks(page(Array.from({ length: MAX_BLOCKS + 50 }, (_, i) => `<p>item ${i}</p>`).join('')))).toHaveLength(MAX_BLOCKS);
    expect(extractBlocks(page(`<p>${'a'.repeat(5000)}</p>`))[0]?.text).toHaveLength(MAX_BLOCK_CHARS);
    expect(texts(`<p>—</p><p>|</p><p>ok</p>`)).toEqual(['ok']);
  });

  it('collapses whitespace and decodes entities', () => {
    expect(texts(`<p>Heating &amp;\n   Cooling&nbsp;Experts</p>`)).toEqual(['Heating & Cooling Experts']);
  });
});
