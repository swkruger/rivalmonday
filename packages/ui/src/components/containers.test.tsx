// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Band } from './band';
import { Card } from './card';
import { Kpi, KpiStrip } from './kpi-strip';
import { Section } from './section';
import { Table, TableCell, TableFrame, TableHead } from './table';

afterEach(cleanup);

describe('Section', () => {
  it('renders a section with an h2 title', () => {
    render(<Section title="Rivals">body</Section>);
    expect(screen.getByRole('heading', { level: 2, name: 'Rivals' })).toBeTruthy();
    expect(document.querySelector('section')).not.toBeNull();
  });
  it('uses h3 with as', () => {
    render(<Section title="Sub" as="h3">x</Section>);
    expect(screen.getByRole('heading', { level: 3, name: 'Sub' })).toBeTruthy();
  });
  it('ruled adds the top rule', () => {
    render(<Section ruled title="T">x</Section>);
    const el = document.querySelector('section')!;
    expect(el.className).toContain('border-t');
    expect(el.className).toContain('pt-6');
  });
});

describe('Section labelled', () => {
  it('labelled titled Section is a named region; default is not', () => {
    const { unmount } = render(<Section labelled title="Compare" titleAside={<button type="button">tip</button>}>x</Section>);
    expect(screen.getByRole('region', { name: 'Compare' })).toBeTruthy();
    unmount();
    render(<Section title="Plain">x</Section>);
    expect(screen.queryByRole('region')).toBeNull();
  });
});

describe('Section titleAside', () => {
  it('renders the aside after the heading, outside its accessible name', () => {
    render(<Section title="Moves detected" titleAside={<button type="button">What is a move?</button>}>x</Section>);
    const h = screen.getByRole('heading', { level: 2, name: 'Moves detected' });
    const aside = screen.getByRole('button', { name: 'What is a move?' });
    expect(h.contains(aside)).toBe(false);
    expect(h.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('Band', () => {
  it('exposes its tone', () => {
    render(<Band tone="muted">x</Band>);
    expect(document.querySelector('[data-slot="band"]')!.getAttribute('data-tone')).toBe('muted');
  });
});

describe('Kpi', () => {
  it('good when a falling value is wanted down', () => {
    render(
      <KpiStrip>
        <Kpi label="Rank" value="3" delta={{ value: -2, goodWhen: 'down', comparison: 'from last week' }} />
      </KpiStrip>,
    );
    const d = screen.getByLabelText('Down 2 from last week');
    expect(d.getAttribute('data-tone')).toBe('good');
  });
  it('bad when opposite', () => {
    render(<Kpi label="Rank" value="3" delta={{ value: 2, unit: '%', goodWhen: 'down', comparison: 'since May' }} />);
    expect(screen.getByLabelText('Up 2% since May').getAttribute('data-tone')).toBe('bad');
  });
  it('zero is No change, neutral', () => {
    render(<Kpi label="Rating" value="4.7" delta={{ value: 0, goodWhen: 'up', comparison: 'from last week' }} />);
    const d = screen.getByLabelText('No change from last week');
    expect(d.getAttribute('data-tone')).toBe('neutral');
  });
  it('href makes the cell a link with label and value', () => {
    render(<Kpi label="Reviews" value="120" href="/r" />);
    const a = screen.getByRole('link');
    expect(a.getAttribute('href')).toBe('/r');
    expect(a.textContent).toContain('Reviews');
    expect(a.textContent).toContain('120');
  });
});

describe('Kpi linkAs', () => {
  it('renders through a custom link component', () => {
    const Custom = ({ href, children, ...r }: { href: string; children: React.ReactNode }) => (
      <a data-custom="1" href={href} {...r}>{children}</a>
    );
    render(<Kpi label="Reviews" value="120" href="/r" linkAs={Custom} />);
    const a = screen.getByRole('link');
    expect(a.getAttribute('data-custom')).toBe('1');
    expect(a.getAttribute('href')).toBe('/r');
    expect(a.textContent).toContain('Reviews120');
  });
});

describe('Table', () => {
  it('TableFrame is a bordered, rounded frame whose focus outlines are inset (clipping-safe)', () => {
    render(<TableFrame>x</TableFrame>);
    const cls = document.querySelector('[data-slot="table-frame"]')!.className.split(' ');
    expect(cls).toEqual(expect.arrayContaining(['rounded-md', 'border', 'border-line', '[&_:focus-visible]:-outline-offset-2!']));
  });
  it('numeric cells right-align with tabular figures', () => {
    render(
      <Table>
        <thead><tr><TableHead numeric>N</TableHead></tr></thead>
        <tbody><tr><TableCell numeric>1</TableCell></tr></tbody>
      </Table>,
    );
    for (const el of [screen.getByRole('columnheader'), screen.getByRole('cell')]) {
      expect(el.className).toContain('text-right');
      expect(el.className).toContain('tabular-nums');
    }
  });
  it('compact density is exposed', () => {
    render(<Table density="compact"><tbody /></Table>);
    expect(document.querySelector('[data-slot="table"]')!.getAttribute('data-density')).toBe('compact');
  });
});

describe('Card', () => {
  it('interactive + selected expose data attributes', () => {
    render(<Card variant="interactive" selected>x</Card>);
    const el = document.querySelector('[data-slot="card"]')!;
    expect(el.getAttribute('data-variant')).toBe('interactive');
    expect(el.getAttribute('data-selected')).toBe('true');
  });
  it('selected interactive card drops hover classes', () => {
    render(<Card variant="interactive" selected>x</Card>);
    expect(document.querySelector('[data-slot="card"]')!.className).not.toContain('hover:bg-canvas');
  });
  it('defaults to the default variant, unselected', () => {
    render(<Card>x</Card>);
    const el = document.querySelector('[data-slot="card"]')!;
    expect(el.getAttribute('data-variant')).toBe('default');
    expect(el.getAttribute('data-selected')).toBeNull();
  });
});
