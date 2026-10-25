import { addContact } from '@cs/engine';
import { client } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { ctx, dbs, registry, resetWorkspace } from './workspace-fixtures';

const contact = (c = ctx('client_owner', [IDS.clientA1]), clientId: string = IDS.clientA1) => registry.invoke(c, 'get_feedback_contact', { clientId });

beforeEach(resetWorkspace);

describe('get_feedback_contact (7c2)', () => {
  it('returns the AM, else the admin', async () => {
    expect(await contact()).toBeNull(); // no agency contact yet: the page hides the line
    await addContact(dbs.service, { agencyId: IDS.agencyA, role: 'agency_admin', email: 'admin@a.example' });
    expect(await contact()).toEqual({ email: 'admin@a.example', name: null });
    await addContact(dbs.service, { agencyId: IDS.agencyA, role: 'account_manager', email: 'am@a.example', name: 'Sam' });
    expect(await contact()).toEqual({ email: 'am@a.example', name: 'Sam' });
  });

  it("another agency's client → not_found; so is an out-of-scope or archived client", async () => {
    await addContact(dbs.service, { agencyId: IDS.agencyA, role: 'account_manager', email: 'am@a.example' });
    await expect(contact(ctx('agency_admin', 'all', [], IDS.agencyB), IDS.clientA1)).rejects.toMatchObject({ code: 'not_found' });
    await expect(contact(ctx('client_owner', [IDS.clientA2]), IDS.clientA1)).rejects.toMatchObject({ code: 'not_found' });
    await dbs.owner.update(client).set({ archivedAt: new Date() }).where(eq(client.id, IDS.clientA1));
    await expect(contact(ctx('agency_admin', 'all'))).rejects.toMatchObject({ code: 'not_found' });
  });

  it('client_viewer of the client gets it; the tool is web only', async () => {
    await addContact(dbs.service, { agencyId: IDS.agencyA, role: 'account_manager', email: 'am@a.example', name: 'Sam' });
    expect(await contact(ctx('client_viewer', [IDS.clientA1]))).toEqual({ email: 'am@a.example', name: 'Sam' });
    await expect(registry.invoke(ctx('client_viewer', [IDS.clientA1]), 'get_feedback_contact', { clientId: IDS.clientA1 }, { channel: 'mcp', tokenId: 't', tokenScope: 'read' })).rejects.toThrow();
  });
});
