import { getViewer } from '@/server/current-viewer';
import { callTool } from '@/server/tools';

export const dynamic = 'force-dynamic';

const notFoundResponse = () => new Response('Not found', { status: 404 });

/** One CSV cell: quoted when it holds a comma, quote or line break; a leading = + - @ TAB or CR is neutralised with an apostrophe (formula injection). */
export function csvCell(value: string): string {
  const v = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** `/agency/settings/billing/seats.csv`: the billable seat report. Agency admins only, via `get_seat_report`; everyone else gets a 404. */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer || viewer.kind !== 'user' || viewer.ctx.role !== 'agency_admin') return notFoundResponse();
  let report: { clients: { name: string; activatedAt: string }[] };
  try {
    report = await callTool(viewer.ctx, 'get_seat_report', {});
  } catch (e) {
    // `callTool` turns a tool refusal into Next's notFound() error; a route handler answers it directly.
    if (String((e as { digest?: unknown } | null)?.digest ?? '').includes('404')) return notFoundResponse();
    throw e;
  }
  const lines = ['client,activated_on', ...report.clients.map((c) => `${csvCell(c.name)},${c.activatedAt.slice(0, 10)}`)];
  return new Response(`${lines.join('\r\n')}\r\n`, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="seats.csv"', 'cache-control': 'private, no-store' },
  });
}
