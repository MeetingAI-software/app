import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getLegalPublication, type LegalLocale } from '@/lib/legal';
import { LegalPage } from './LegalPage';
import { PolicyContent, policyMetadata, type LegalPolicyKind } from './PolicyContent';

const policyPaths = {
  en: { privacy: '/privacy', terms: '/terms', refund: '/refund-policy' },
  sv: { privacy: '/sv/privacy', terms: '/sv/terms', refund: '/sv/refund-policy' },
};

export async function PublishedLegalPage({ kind, locale }: {
  kind: LegalPolicyKind;
  locale: LegalLocale;
}) {
  // Legal identity is intentionally server-side runtime configuration. This also prevents a build
  // artifact from capturing an address before the owners explicitly approve publication.
  await connection();
  const publication = getLegalPublication();
  if (!publication) notFound();

  const alternateLocale = locale === 'en' ? 'sv' : 'en';
  const metadata = policyMetadata(kind, locale);

  return (
    <LegalPage
      locale={locale}
      title={metadata.title}
      description={metadata.description}
      alternateHref={policyPaths[alternateLocale][kind]}
      publication={publication}
    >
      <PolicyContent kind={kind} locale={locale} seller={publication.seller} />
    </LegalPage>
  );
}
