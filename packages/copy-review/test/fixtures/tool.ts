// @ts-nocheck -- scanner fixture, never compiled
export const tool = defineTool({
  name: 'Get Overview Tool',
  description: 'Returns the weekly overview for a client.',
  input: z.object({ clientId: z.string().describe('The client to look up.') }),
  other: 'Not a described property.',
  nested: { description: 'A nested description value.' },
});
