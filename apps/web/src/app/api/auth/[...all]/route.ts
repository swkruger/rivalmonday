import { toNextJsHandler } from 'better-auth/next-js';
import { requestAuth } from '@/server/auth';

// 13a1 (P6): the instance of the origin this request is on (platform, an agency host or the MCP host).
const handler = async (req: Request) => (await requestAuth()).handler(req);
export const { GET, POST } = toNextJsHandler(handler);
