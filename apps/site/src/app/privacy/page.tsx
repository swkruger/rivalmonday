import { LegalPage } from '../../components/legal/legal-page';
import { pageMetadata } from '../../lib/metadata';

export const metadata = pageMetadata('/privacy');

export default function Page() {
  return <LegalPage name="privacy" title="Privacy" />;
}
