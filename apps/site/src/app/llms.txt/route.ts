import { PAGES } from '../../../content/pages';
import { buildLlmsTxt } from '../../lib/llms';

export const dynamic = 'force-static';

export function GET() {
  return new Response(buildLlmsTxt(PAGES), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
