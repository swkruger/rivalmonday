import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../../.env', import.meta.url)));
} catch {
  // optional
}

const { createDb } = await import('@cs/db');
const {
  computeDecisionReport, createPackLoader, exportUnlabeled, formatReport, importLabels, listOpenReviews, loadLabeledAnswers, parseLabelCsv, resolveDecisionReview, toCsv,
} = await import('@cs/engine');
const { parseDecisionsArgs } = await import('./decisions-args');

const args = parseDecisionsArgs(process.argv.slice(2));
if ('error' in args) {
  console.error(args.error);
  process.exit(1);
}
const url = process.env.SERVICE_DATABASE_URL;
if (!url) {
  console.error('SERVICE_DATABASE_URL is required');
  process.exit(1);
}

const { db, close } = createDb(url);
let code = 0;
try {
  switch (args.cmd) {
    case 'report':
      console.log(formatReport(computeDecisionReport(await loadLabeledAnswers(db, { task: args.task, since: args.since }))));
      break;
    case 'export': {
      const rows = await exportUnlabeled(db, { task: args.task, limit: args.limit });
      await writeFile(args.out, toCsv(rows), 'utf8');
      console.log(`wrote ${rows.length} unlabelled question(s) to ${args.out} — fill in the "label" column, then run: decisions import --in ${args.out} --by <name>`);
      break;
    }
    case 'import': {
      const r = await importLabels(db, parseLabelCsv(await readFile(args.in, 'utf8')), { labeledBy: args.by });
      console.log(`imported ${r.imported} label(s)`);
      for (const e of r.errors) console.error(`  skipped: ${e}`);
      if (r.errors.length > 0) code = 1;
      break;
    }
    case 'reviews': {
      const open = await listOpenReviews(db, args.limit);
      if (open.length === 0) console.log('no open reviews');
      for (const r of open) {
        const said = Object.entries(r.answers).map(([k, a]) => `${k}=${String((a as { value?: unknown }).value)}(${((a as { confidence?: number }).confidence ?? 0).toFixed(2)})`).join(' ');
        console.log(`${r.id} ${r.createdAt.toISOString().slice(0, 10)} ${r.competitorName} [${r.source} ${r.kind}] needs: ${r.keys.join(',')}\n    model: ${said}\n    before: ${(r.beforeText ?? '').slice(0, 160)}\n    after:  ${(r.afterText ?? '').slice(0, 160)}`);
      }
      break;
    }
    case 'resolve':
      console.log(JSON.stringify(await resolveDecisionReview({ db, packs: createPackLoader() }, args.reviewId, { answers: args.answers, resolvedBy: args.by })));
      break;
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  code = 1;
} finally {
  await close();
}
process.exit(code);
