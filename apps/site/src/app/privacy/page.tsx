import { LegalPage } from '../../components/legal/legal-page';
import { BreadcrumbJsonLd } from '../../components/seo/page-intro';
import { pageMetadata } from '../../lib/metadata';

export const metadata = pageMetadata('/privacy');

export default function Page() {
  return (
    <>
      <BreadcrumbJsonLd path="/privacy" />
      <LegalPage name="privacy" title="Privacy" />
    </>
  );
}
