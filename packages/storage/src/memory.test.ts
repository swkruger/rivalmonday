import { runStoreContract } from './contract';
import { createMemoryStore } from './memory';

runStoreContract('memory', () => createMemoryStore());
