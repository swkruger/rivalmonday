// @vitest-environment jsdom
import type { CaptureCompareView } from '@cs/tools';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { collapseUnchanged, WholePageDiff } from './whole-page-diff';

type Block = CaptureCompareView['blocks'][number];
const u = (t: string): Block => ({ kind: 'unchanged', segments: [{ op: 'equal', text: t }] });
const added: Block = { kind: 'added', segments: [{ op: 'insert', text: 'New offer' }] };
const removed: Block = { kind: 'removed', segments: [{ op: 'delete', text: 'Old offer' }] };
const modified: Block = { kind: 'modified', segments: [{ op: 'equal', text: 'Tune-up ' }, { op: 'delete', text: '$99' }, { op: 'insert', text: '$79' }] };

const base: CaptureCompareView = {
  state: 'ok',
  before: { captureId: 'b', capturedAt: '2026-10-21T14:00:00Z' },
  after: { captureId: 'a', capturedAt: '2026-10-22T14:00:00Z' },
  pageUrl: 'https://x.example',
  blocks: [],
  truncated: false,
  blocksCapped: false,
  maskedCount: 0,
};

describe('collapseUnchanged', () => {
  it('collapses runs of 3+ and keeps runs of 1-2 (incl. leading/trailing runs)', () => {
    const runs = collapseUnchanged([u('1'), u('2'), u('3'), added, u('4'), u('5'), removed, u('6'), u('7'), u('8'), u('9')]);
    expect(runs.map((r) => r.type)).toEqual(['collapsed', 'block', 'block', 'block', 'block', 'collapsed']);
    expect(runs[0]).toMatchObject({ type: 'collapsed', blocks: [u('1'), u('2'), u('3')] });
    expect((runs[5] as { blocks: Block[] }).blocks).toHaveLength(4);
  });
});

describe('WholePageDiff', () => {
  it('renders chips and summary "4 unchanged sections"', () => {
    const { container } = render(<WholePageDiff timezone="America/Chicago" view={{ ...base, blocks: [u('a'), u('b'), u('c'), u('d'), added, removed, modified] }} />);
    expect(screen.getByText('4 unchanged sections')).toBeTruthy();
    expect(screen.getByText('Added')).toBeTruthy();
    expect(screen.getByText('Removed')).toBeTruthy();
    expect(screen.getByText('Changed')).toBeTruthy();
    expect(screen.getByText(/Compared with the capture from Oct 21, 9:00 AM CT/)).toBeTruthy();
    expect(container.querySelector('ins[aria-label="added: $79"]')).toBeTruthy();
    expect(container.querySelector('del[aria-label="removed: $99"]')).toBeTruthy();
  });

  it('shows masked, truncated, first and no_blocks notes', () => {
    const { rerender } = render(<WholePageDiff timezone="UTC" view={{ ...base, maskedCount: 3, truncated: true, blocks: [added] }} />);
    expect(screen.getByText('3 sections change on every visit and are hidden.')).toBeTruthy();
    expect(screen.getByText('This page changed too much to compare word by word, so some sections show as removed and added in full.')).toBeTruthy();
    rerender(<WholePageDiff timezone="UTC" view={{ ...base, state: 'first', before: null }} />);
    expect(screen.getByText('This is the first capture of this page, so there is nothing to compare yet.')).toBeTruthy();
    rerender(<WholePageDiff timezone="UTC" view={{ ...base, state: 'no_blocks' }} />);
    expect(screen.getByText('Comparison not available for this capture.')).toBeTruthy();
    rerender(<WholePageDiff timezone="UTC" view={{ ...base, blocks: [u('a')] }} />);
    expect(screen.getByText('No differences on this page.')).toBeTruthy();
  });

  it('singular masked note for one section', () => {
    render(<WholePageDiff timezone="UTC" view={{ ...base, maskedCount: 1, blocks: [added] }} />);
    expect(screen.getByText('1 section changes on every visit and is hidden.')).toBeTruthy();
  });

  it('shows the too-long note when blocksCapped, without the word-by-word note', () => {
    render(<WholePageDiff timezone="UTC" view={{ ...base, blocksCapped: true, blocks: [added] }} />);
    expect(screen.getByText('This page is too long to compare in full, so only the first part is shown.')).toBeTruthy();
    expect(screen.queryByText(/word by word/)).toBeNull();
  });

  it('hides the "Compared with" header unless the comparison is available', () => {
    render(<WholePageDiff timezone="UTC" view={{ ...base, state: 'no_blocks' }} />);
    expect(screen.getByText('Comparison not available for this capture.')).toBeTruthy();
    expect(screen.queryByText(/Compared with the capture from/)).toBeNull();
  });
});
