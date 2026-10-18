import { askMetadata, AskScreen } from '../ask-screen';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return askMetadata();
}

export default async function AskThreadPage({ params }: { params: Promise<{ clientId: string; threadId: string }> }) {
  const { clientId, threadId } = await params;
  return <AskScreen clientId={clientId} threadId={threadId} />;
}
