// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { QueuesTable, SourcesTable, VendorsTable, WorkerTable } from './health-tables';

afterEach(cleanup);
const now = new Date('2026-10-23T12:00:00Z');

describe('health tables', () => {
  it('health table uses StatusChip (no hex class)', () => {
    const { container } = render(
      <>
        <WorkerTable worker={{ status: 'ok', lastHeartbeatAt: '2026-10-23T11:58:00Z' }} now={now} tz="UTC" />
        <QueuesTable queues={[{ name: 'collect', status: 'warn', queued: 1, active: 0, failed24h: 2, oldestQueuedAgeS: 4000 }]} />
        <VendorsTable vendors={[{ vendor: 'dataforseo', status: 'down', calls24h: 10, errors24h: 9, lastOkAt: null }]} now={now} tz="UTC" />
        <SourcesTable sources={[{ kind: 'capture', status: 'ok', lastOkAt: null }]} now={now} tz="UTC" />
      </>,
    );
    const chips = [...container.querySelectorAll('[data-slot="status-chip"]')];
    expect(chips.map((c) => [c.textContent, c.getAttribute('data-tone')])).toEqual([
      ['Working', 'success'], ['Slow', 'warning'], ['Down', 'danger'], ['Working', 'success'],
    ]);
    expect(container.innerHTML).not.toMatch(/bg-\[#|text-\[#/);
    expect(screen.queryByText('OK')).toBeNull();
    expect(screen.queryByText('Watch')).toBeNull();
  });

  it('last-success time shows relative text with the absolute time in the viewer zone on hover', () => {
    const { container } = render(<WorkerTable worker={{ status: 'ok', lastHeartbeatAt: '2026-10-23T11:58:00Z' }} now={now} tz="America/Chicago" />);
    const t = container.querySelector('time')!;
    expect(t.textContent).toBe('2 min ago');
    expect(t.getAttribute('title')).toBe('Oct 23, 6:58 AM CT');
  });
});
