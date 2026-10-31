export type ControlRow = { tag: string; type: string; name: string; h: number; w: number; font: number; radius: string; border: string; borderW: string; bg: string };
export type ChartTextRow = { text: string; px: number; clipped: boolean };
export type PageAudit = { label: string; as: string; width: number; status: number; url: string; title: string; overflowX: number; controls: ControlRow[]; chartText: ChartTextRow[]; truncated: string[] };

/** Runs in the browser: measures every visible control and SVG label. Clipped = the text box leaves its svg's box. */
export function auditPage(): Omit<PageAudit, 'label' | 'as' | 'width' | 'status' | 'url'> {
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const controls = [...document.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(visible).map((el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const i = el as HTMLInputElement;
    return { tag: el.tagName.toLowerCase(), type: i.type ?? '', name: i.name || i.id || i.placeholder || '', h: Math.round(r.height), w: Math.round(r.width), font: parseFloat(s.fontSize), radius: s.borderRadius, border: s.borderTopColor, borderW: s.borderTopWidth, bg: s.backgroundColor };
  });
  const chartText: ChartTextRow[] = [];
  for (const t of document.querySelectorAll('svg text')) {
    const svg = (t as SVGTextElement).ownerSVGElement;
    if (!svg || !visible(t)) continue;
    const m = (t as SVGTextElement).getScreenCTM();
    const sb = svg.getBoundingClientRect();
    const tb = t.getBoundingClientRect();
    const fs = parseFloat(getComputedStyle(t).fontSize);
    chartText.push({ text: (t.textContent ?? '').slice(0, 30), px: Math.round(fs * (m?.a ?? 1) * 10) / 10, clipped: tb.left < sb.left - 0.5 || tb.right > sb.right + 0.5 || tb.top < sb.top - 0.5 || tb.bottom > sb.bottom + 0.5 });
  }
  const truncated = [...document.querySelectorAll('main *')]
    .filter((el) => {
      const h = el as HTMLElement;
      return h.children.length === 0 && visible(h) && h.scrollWidth > h.clientWidth + 1 && ['hidden', 'clip'].includes(getComputedStyle(h).overflowX) && !!h.textContent?.trim();
    })
    .slice(0, 15)
    .map((el) => (el.textContent ?? '').trim().slice(0, 50));
  return { title: document.querySelector('h1')?.textContent ?? document.title, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth, controls, chartText, truncated };
}
