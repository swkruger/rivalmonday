import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/server/auth';

const handler = (req: Request) => auth().handler(req);
export const { GET, POST } = toNextJsHandler(handler);
