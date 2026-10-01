import type { DataForSeoClient, DfsTask } from '../src/vendors/dataforseo';

export function dfsTask(result: unknown[], overrides: Partial<DfsTask> = {}): DfsTask {
  return { id: '11111111-1111-4111-8111-111111111111', statusCode: 20000, statusMessage: 'Ok.', result, ...overrides };
}

export function fakeDfs(handler: (method: 'POST' | 'GET', path: string, body?: Record<string, unknown>[]) => DfsTask[] | Promise<DfsTask[]>) {
  const calls: { method: string; path: string; body?: Record<string, unknown>[] }[] = [];
  const client: DataForSeoClient & { calls: typeof calls } = {
    calls,
    async post(path, tasks) {
      calls.push({ method: 'POST', path, body: tasks });
      return handler('POST', path, tasks);
    },
    async get(path) {
      calls.push({ method: 'GET', path });
      return handler('GET', path);
    },
  };
  return client;
}
