import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BOT_TOKEN, defaultFetchText } from './user-agent';

const BIG_BODY_SIZE = 2 * 1024 * 1024; // 2 MB, well over the 512 KB cap
const MAX_BODY = 512 * 1024;

let server: http.Server;
let baseUrl: string;
let lastUserAgent: string | undefined;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    lastUserAgent = req.headers['user-agent'];
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('x'.repeat(BIG_BODY_SIZE));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('expected a bound TCP address');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

describe('defaultFetchText', () => {
  it('caps the body at 512 KB even when the server sends more, and sends the bot user agent', async () => {
    const result = await defaultFetchText(baseUrl);
    expect(result.status).toBe(200);
    expect(result.body.length).toBeLessThanOrEqual(MAX_BODY);
    expect(lastUserAgent).toContain(BOT_TOKEN);
  });
});
