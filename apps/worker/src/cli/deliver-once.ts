import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../../.env', import.meta.url)));
} catch {
  // repo-root .env is optional
}

const { writeFile } = await import('node:fs/promises');
const { createAiFromEnv, DEFAULT_AI_CONFIG_PATH, loadAiConfigFile } = await import('@cs/ai');
const { verifyLink } = await import('@cs/core');
const { brief, client, createDb, createDecisionSampleSink, createLedgerSink } = await import('@cs/db');
const engine = await import('@cs/engine');
const { createEmailTransportFromEnv } = await import('@cs/email');
const { createStoreFromEnv } = await import('@cs/storage');
const { eq } = await import('drizzle-orm');
const { createPdfRenderer } = await import('../pdf');
const { parseDeliverArgs } = await import('./deliver-args');

const args = parseDeliverArgs(process.argv.slice(2));
if ('error' in args) {
  console.error(args.error);
  process.exit(1);
}
const serviceUrl = process.env.SERVICE_DATABASE_URL;
if (!serviceUrl) {
  console.error('SERVICE_DATABASE_URL is required');
  process.exit(1);
}
const needDelivery = () => {
  const cfg = engine.deliveryConfigFromEnv(process.env);
  if (!cfg) throw new Error('APP_URL and LINK_SIGNING_SECRET (at least 32 characters) are required');
  return cfg;
};
const { db, close } = createDb(serviceUrl);
const ai = () => loadAiConfigFile(DEFAULT_AI_CONFIG_PATH).then((cfg) => createAiFromEnv(process.env, cfg, createLedgerSink(db), createDecisionSampleSink(db)));
const packs = engine.createPackLoader();
const print = (label: string, value: unknown) => console.log(`[${label}] ${JSON.stringify(value, null, 2)}`);
try {
  const now = 'now' in args && args.now ? args.now : new Date();
  switch (args.cmd) {
    case 'contact-add':
      print('contact', { id: await engine.addContact(db, { agencyId: args.agency, clientId: args.client ?? null, role: args.role, email: args.email, name: args.name ?? null, timezone: args.tz ?? null, quietHours: args.quiet ?? null, clientScope: args.scope ?? null }) });
      break;
    case 'settings': {
      // Operator tool on the service connection; the role-checked path for the app is updateClientDelivery.
      const set = { ...(args.alertMode ? { alertMode: args.alertMode } : {}), ...(args.autoSend !== undefined ? { briefAutoSend: args.autoSend } : {}) };
      if (Object.keys(set).length > 0) await db.update(client).set(set).where(eq(client.id, args.client));
      print('settings', (await db.select({ alertMode: client.alertMode, briefAutoSend: client.briefAutoSend }).from(client).where(eq(client.id, args.client)))[0]);
      break;
    }
    case 'alerts': {
      const sweep = await engine.sweepAlerts(db, now);
      print('sweep', sweep);
      const deps = { db, ai: await ai(), packs, delivery: needDelivery() };
      for (const id of sweep.drafting) print(`alert ${id}`, await engine.processAlert(deps, id, now));
      break;
    }
    case 'alert-dry': {
      const [c] = await db.select({ agencyId: client.agencyId }).from(client).where(eq(client.id, args.client));
      if (!c) throw new Error(`client ${args.client} not found`);
      print('alert (dry run, nothing stored)', await engine.writeAlertText({ db, ai: await ai(), packs }, { agencyId: c.agencyId, clientId: args.client, eventId: args.event }, now));
      break;
    }
    case 'digest':
      print('digest', await engine.runAlertDigests({ db, delivery: needDelivery() }, now));
      break;
    case 'dispatch': {
      const cfg = needDelivery();
      const web = engine.createWebhookSender({ db });
      const transport = createEmailTransportFromEnv(process.env, createLedgerSink(db));
      print(`dispatch via ${transport.kind}`, await engine.dispatchDue({ db, senders: { email: engine.createEmailSender({ transport, fromAddress: cfg.fromAddress }), slack: web, teams: web } }, now));
      break;
    }
    case 'deliver':
      print('deliver', await engine.deliverDueBriefs({ db, delivery: needDelivery() }, now));
      break;
    case 'report':
      print('report', await engine.runQuarterlyReports({ db, packs, delivery: needDelivery() }, now));
      break;
    case 'send': {
      const [b] = await db.select({ status: brief.status }).from(brief).where(eq(brief.id, args.brief));
      if (b?.status === 'ready') await db.transaction((tx) => engine.approveBriefTx(tx, args.brief, 'cli', now));
      print('send', await engine.deliverBrief({ db, delivery: needDelivery() }, args.brief, now));
      break;
    }
    case 'pdf': {
      const renderer = createPdfRenderer();
      try {
        const pdf = async (html: string, meta: Parameters<typeof renderer>[1], opts: Parameters<typeof renderer>[2]) => {
          const bytes = await renderer(html, meta, opts);
          await writeFile(args.out, bytes);
          return bytes;
        };
        const deps = { db, store: createStoreFromEnv(process.env), pdf };
        print('pdf', args.brief ? await engine.renderBriefPdf(deps, args.brief) : await engine.renderReportPdf(deps, args.report!));
        console.log(`written to ${args.out}`);
      } finally {
        await renderer.close();
      }
      break;
    }
    case 'link':
      print('link', verifyLink(needDelivery().linkSecrets, args.verify, now) ?? 'invalid or expired');
      break;
  }
} finally {
  await close();
}
