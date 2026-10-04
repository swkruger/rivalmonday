import { describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { createDeliveryJobs, warnIfDeliveryUnconfigured } from './delivery';

const A = '00000000-0000-4000-8000-0000000000e1';
const B = '00000000-0000-4000-8000-0000000000e2';
const queue = () => ({ enqueueAlert: vi.fn(async () => {}), enqueueBriefPdf: vi.fn(async () => {}), enqueueReportPdf: vi.fn(async () => {}) });
const base = (o: Partial<Record<keyof WorkerDeps, unknown>> = {}) =>
  ({ deliveryConfigured: () => true, engineConfigured: () => true, listBriefsMissingPdf: async () => [], listReportsMissingPdf: async () => [], ...o }) as unknown as WorkerDeps;

describe('delivery jobs', () => {
  it('sweep enqueues one alert-process job per drafting alert', async () => {
    const q = queue();
    const deps = base({ sweepAlerts: vi.fn(async () => ({ created: 1, merged: 0, expired: 0, drafting: [A] })) });
    const jobs = createDeliveryJobs(deps, q);
    await jobs.alertsSweep.handler({});
    expect(q.enqueueAlert.mock.calls).toEqual([[A]]);
    expect(jobs.alertsSweep.cron).toBe('* * * * *');
    expect(jobs.alertProcess.queue).toMatchObject({ policy: 'short', retryLimit: 0 });
  });

  it('does nothing until delivery (APP_URL + LINK_SIGNING_SECRET) and the engine are configured', async () => {
    const deps = base({ deliveryConfigured: () => false, sweepAlerts: vi.fn(), dispatchNotifications: vi.fn(), deliverDueBriefs: vi.fn(), runAlertDigests: vi.fn(), runQuarterlyReports: vi.fn() });
    const jobs = createDeliveryJobs(deps, queue());
    for (const j of [jobs.alertsSweep, jobs.dispatch, jobs.briefsDeliver, jobs.digest, jobs.reports]) await j.handler({});
    expect(deps.sweepAlerts).not.toHaveBeenCalled();
    expect(deps.dispatchNotifications).not.toHaveBeenCalled();
    expect(deps.deliverDueBriefs).not.toHaveBeenCalled();
  });

  it('renders a PDF for every brief delivered and every report created', async () => {
    const q = queue();
    const deps = base({ deliverDueBriefs: vi.fn(async () => ({ sent: [A], autoApproved: 0, overdue: 0 })), runQuarterlyReports: vi.fn(async () => ({ created: [A] })) });
    const jobs = createDeliveryJobs(deps, q);
    await jobs.briefsDeliver.handler({});
    await jobs.reports.handler({});
    expect(q.enqueueBriefPdf.mock.calls).toEqual([[A]]);
    expect(q.enqueueReportPdf.mock.calls).toEqual([[A]]);
    expect([jobs.briefsDeliver.cron, jobs.digest.cron, jobs.dispatch.cron, jobs.reports.cron]).toEqual(['10 * * * *', '2 * * * *', '* * * * *', '20 * * * *']);
  });

  it('re-enqueues PDFs that never rendered for recently sent briefs and reports, once per id', async () => {
    const q = queue();
    const deps = base({
      deliverDueBriefs: vi.fn(async () => ({ sent: [A], autoApproved: 0, overdue: 0 })), listBriefsMissingPdf: vi.fn(async () => [A, B]),
      runQuarterlyReports: vi.fn(async () => ({ created: [] })), listReportsMissingPdf: vi.fn(async () => [B]),
    });
    const jobs = createDeliveryJobs(deps, q);
    await jobs.briefsDeliver.handler({});
    await jobs.reports.handler({});
    expect(q.enqueueBriefPdf.mock.calls).toEqual([[A], [B]]);
    expect(q.enqueueReportPdf.mock.calls).toEqual([[B]]);
  });

  it('warns once at start when delivery is not configured, without printing any value', () => {
    const warn = vi.fn();
    warnIfDeliveryUnconfigured({ deliveryConfigured: () => true }, warn);
    expect(warn).not.toHaveBeenCalled();
    warnIfDeliveryUnconfigured({ deliveryConfigured: () => false }, warn);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(/delivery is not configured \(APP_URL and LINK_SIGNING_SECRET/);
  });
});
