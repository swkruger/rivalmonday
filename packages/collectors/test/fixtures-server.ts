import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface Route {
  status?: number;
  body: string;
  delayMs?: number;
  contentType?: string;
}

export async function startFixtureServer(routes: Record<string, Route>) {
  const server = createServer((req, res) => {
    const route = routes[new URL(req.url ?? '/', 'http://x').pathname];
    const send = () => {
      if (!route) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
        return;
      }
      res.writeHead(route.status ?? 200, { 'content-type': route.contentType ?? 'text/html; charset=utf-8' }).end(route.body);
    };
    if (route?.delayMs) setTimeout(send, route.delayMs);
    else send();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return {
    url: (path: string) => `http://127.0.0.1:${port}${path}`,
    close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }),
  };
}
