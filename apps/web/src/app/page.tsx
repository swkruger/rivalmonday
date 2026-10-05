import { redirect } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { homePath } from '@/server/nav';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { ctx } = await requireContext();
  redirect(homePath(ctx));
}
