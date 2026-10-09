export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path: string[] }> };

async function dispatch(method: 'GET' | 'POST', req: Request, ctx: Ctx): Promise<Response> {
  // Spec 5.3: constant-folded to `false` in production builds, so the panel module is never bundled there.
  if (process.env.NODE_ENV !== 'production') {
    const { handleDevPanel } = await import('@/dev-panel/handlers');
    return handleDevPanel(method, req, (await ctx.params).path);
  }
  return new Response('Not found', { status: 404 });
}

export async function GET(req: Request, ctx: Ctx) {
  return dispatch('GET', req, ctx);
}

export async function POST(req: Request, ctx: Ctx) {
  return dispatch('POST', req, ctx);
}
