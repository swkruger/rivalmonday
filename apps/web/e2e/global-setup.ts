import setup from '../../../packages/db/test/global-setup';
import { seed } from './seed';

export default async function globalSetup(): Promise<void> {
  await setup();
  await seed();
}
