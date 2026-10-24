import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AREAS_2A, AREAS_2B, BADGE_ALLOW, GATED_PATHS, SRC_ROOT, scanAllHelpText, scanHelpText, scanPaths, scanSource } from './page-gates';

const gates = (file: string, src: string) => scanSource(file, src).map((h) => h.gate);
const fmt = (h: { file: string; line: number; gate: string; text: string }) => `${h.file}:${h.line} ${h.gate} ${h.text}`;

describe('page gates fixtures', () => {
  it('badge gate flags <Badge in a page', () => {
    expect(gates('app/x/page.tsx', '<Badge>{label}</Badge>')).toEqual(['badge']);
  });
  it('badge allow-list passes a listed file', () => {
    BADGE_ALLOW['app/listed/page.tsx'] = 'plan tag, not a status';
    try { expect(gates('app/listed/page.tsx', '<Badge>Pro</Badge>')).toEqual([]); } finally { delete BADGE_ALLOW['app/listed/page.tsx']; }
  });
  it('date gate flags .slice(0, 10) and toLocaleDateString', () => {
    expect(gates('a.tsx', 'const d = x.slice(0, 10);')).toEqual(['date']);
    expect(gates('a.tsx', 'const d = x.slice(0,10);')).toEqual(['date']);
    expect(gates('a.tsx', 'x.toLocaleDateString()')).toEqual(['date']);
    expect(gates('a.tsx', 'x.toISOString()')).toEqual(['date']);
    expect(gates('a.ts', 'x.toISOString()')).toEqual([]);
  });
  it('date gate respects format-gate escape with reason', () => {
    expect(gates('a.tsx', '// format-gate: machine key\nconst d = x.slice(0, 10);')).toEqual([]);
    expect(gates('a.tsx', 'const d = x.toISOString(); // format-gate: query param')).toEqual([]);
    expect(gates('a.tsx', '{/* format-gate: id */}\n{x.toLocaleString()}')).toEqual([]);
  });
  it('escape without reason still flags', () => {
    expect(gates('a.tsx', '// format-gate:\nconst d = x.slice(0, 10);')).toEqual(['date']);
    expect(gates('a.tsx', 'const d = x.slice(0, 10); // format-gate:   ')).toEqual(['date']);
  });
  it('enum gate flags {row.status} but not status={row.status}', () => {
    expect(gates('a.tsx', '<td>{row.status}</td>')).toEqual(['enum']);
    expect(gates('a.tsx', '<td>{r?.billingState}</td>')).toEqual(['enum']);
    expect(gates('a.tsx', '<Chip status={row.status} />')).toEqual([]);
    expect(gates('a.tsx', 'const s = `${row.status}`;')).toEqual([]);
  });
  it('km gate flags "within 5 km" text but not radiusKm identifiers', () => {
    expect(gates('a.tsx', "const t = 'within 5 km';")).toEqual(['km']);
    expect(gates('a.tsx', '<p>Radius 5 km</p>')).toEqual(['km']);
    expect(gates('a.tsx', 'const r = radiusKm * 2; const q = radius_km;')).toEqual([]);
    expect(gates('a.tsx', '// 5 km in a comment')).toEqual([]);
  });
  it('help km gate scans copy and guides', () => {
    expect(scanHelpText('help/copy/x.ts', "a: 'within 5 km',")).toHaveLength(1);
    expect(scanHelpText('docs/help/pages/x.md', 'Radius 5 KM\nfine')).toHaveLength(1);
    expect(scanHelpText('docs/help/pages/x.md', 'miles only')).toEqual([]);
    expect(scanAllHelpText().map(fmt)).toEqual([]);
  });
});

describe('page gates over the tree', () => {
  it('gated paths are clean', () => {
    const hits = scanPaths(GATED_PATHS).map(fmt);
    expect(hits, hits.join('\n')).toEqual([]);
  });
  it('AREAS_2A ⊆ existing folders', () => {
    for (const p of AREAS_2A) expect(existsSync(join(SRC_ROOT, p)), p).toBe(true);
  });
  it('AREAS_2B ⊆ existing paths', () => {
    for (const p of AREAS_2B) expect(existsSync(join(SRC_ROOT, p)), p).toBe(true);
  });
  it('GATED_PATHS ⊆ AREAS_2A ∪ AREAS_2B', () => {
    for (const p of GATED_PATHS) expect([...AREAS_2A, ...AREAS_2B].some((a) => p === a || p.startsWith(`${a}/`)), p).toBe(true);
  });
  it('gated paths cover AREAS_2A', () => {
    // Every 2a area is gated: it equals a gated entry or sits under one.
    for (const a of AREAS_2A) expect(GATED_PATHS.some((g) => a === g || a.startsWith(`${g}/`)), a).toBe(true);
  });
});
