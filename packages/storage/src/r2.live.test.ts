import { describe } from 'vitest';
import { runStoreContract } from './contract';
import { createR2Store } from './r2';

const e = process.env;
const configured = Boolean(e.R2_ACCOUNT_ID && e.R2_ACCESS_KEY_ID && e.R2_SECRET_ACCESS_KEY && e.R2_BUCKET);

// Runs only when R2 credentials are present in the environment / repo-root .env.
describe.skipIf(!configured)('r2 live', () => {
  runStoreContract('r2', () =>
    createR2Store({
      accountId: e.R2_ACCOUNT_ID as string,
      accessKeyId: e.R2_ACCESS_KEY_ID as string,
      secretAccessKey: e.R2_SECRET_ACCESS_KEY as string,
      bucket: e.R2_BUCKET as string,
    }),
  );
});
