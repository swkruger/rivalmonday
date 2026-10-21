import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface Route {
  status?: number;
  body: string;
  delayMs?: number;
  contentType?: string;
  /** Extra response headers, e.g. `{ location: '/next' }` with a 3xx status. */
  headers?: Record<string, string>;
}

export async function startFixtureServer(routes: Record<string, Route>) {
  /** Every request path the server received, in order. */
  const hits: string[] = [];
  /** Every WebSocket upgrade attempt (path); the socket is destroyed. */
  const upgrades: string[] = [];
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    hits.push(path);
    const route = routes[path];
    const send = () => {
      if (!route) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
        return;
      }
      res.writeHead(route.status ?? 200, { 'content-type': route.contentType ?? 'text/html; charset=utf-8', ...route.headers }).end(route.body);
    };
    if (route?.delayMs) setTimeout(send, route.delayMs);
    else send();
  });
  server.on('upgrade', (req, socket) => {
    upgrades.push(new URL(req.url ?? '/', 'http://x').pathname);
    socket.destroy();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return {
    url: (path: string) => `http://127.0.0.1:${port}${path}`,
    hits,
    upgrades,
    close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }),
  };
}
