import { AskScreen } from './ask-screen';

export const dynamic = 'force-dynamic';

export default async function AskPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  return <AskScreen clientId={clientId} threadId={null} />;
}
