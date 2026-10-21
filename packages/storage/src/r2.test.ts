import { describe, expect, it } from 'vitest';
import { createR2Store } from './r2';
import { ObjectExistsError } from './store';

const cfg = { accountId: 'a', accessKeyId: 'k', secretAccessKey: 's', bucket: 'b' };
function fakeClient(existing: boolean) {
  const sent: string[] = [];
  const client = {
    send: async (cmd: { constructor: { name: string } }) => {
      sent.push(cmd.constructor.name);
      if (cmd.constructor.name === 'HeadObjectCommand' && !existing) throw Object.assign(new Error('nf'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
      return {};
    },
  };
  return { client: client as never, sent };
}

describe('r2 put (HEAD-then-put)', () => {
  it('existing key without overwrite throws ObjectExistsError and does not put', async () => {
    const { client, sent } = fakeClient(true);
    await expect(createR2Store(cfg, client).put('a/b.txt', new Uint8Array(), 'text/plain')).rejects.toBeInstanceOf(ObjectExistsError);
    expect(sent).toEqual(['HeadObjectCommand']);
  });
  it('missing key puts after HEAD', async () => {
    const { client, sent } = fakeClient(false);
    await createR2Store(cfg, client).put('a/b.txt', new Uint8Array(), 'text/plain');
    expect(sent).toEqual(['HeadObjectCommand', 'PutObjectCommand']);
  });
  it('overwrite: true is a plain put', async () => {
    const { client, sent } = fakeClient(true);
    await createR2Store(cfg, client).put('a/b.txt', new Uint8Array(), 'text/plain', { overwrite: true });
    expect(sent).toEqual(['PutObjectCommand']);
  });
});
