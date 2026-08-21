import Link from 'next/link';
import { Header } from '@/components/Header';
import { BRAND_NAME } from '@/lib/brand';
import type { LegalLocale, LegalPublication } from '@/lib/legal';

interface LegalPageProps {
  locale: LegalLocale;
  title: string;
  description: string;
  alternateHref: string;
  publication: LegalPublication;
  children: React.ReactNode;
}

const paths = {
  en: { privacy: '/privacy', terms: '/terms', refund: '/refund-policy' },
  sv: { privacy: '/sv/privacy', terms: '/sv/terms', refund: '/sv/refund-policy' },
};

export function LegalPage({
  locale,
  title,
  description,
  alternateHref,
  publication,
  children,
}: LegalPageProps) {
  const labels = locale === 'sv'
    ? { privacy: 'Integritet', terms: 'Villkor', refund: 'Återbetalning', alternate: 'English' }
    : { privacy: 'Privacy', terms: 'Terms', refund: 'Refunds', alternate: 'Svenska' };
  const seller = publication.seller;

  return (
    <>
      <Header />
      <main className="relative z-10 min-h-screen bg-slate-50/95 px-4 pb-20 pt-28 text-slate-900 sm:px-6">
        <article className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10 lg:p-14">
          <div className="flex flex-col gap-5 border-b border-slate-200 pb-8 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-blue-700">{BRAND_NAME}</p>
              <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">{description}</p>
              <p className="mt-3 text-sm text-slate-500">
                {locale === 'sv' ? 'Gäller från' : 'Effective'}: {publication.version}
              </p>
            </div>
            <Link href={alternateHref} hrefLang={locale === 'sv' ? 'en' : 'sv'} className="text-sm font-semibold text-blue-700 underline">
              {labels.alternate}
            </Link>
          </div>

          <nav aria-label={locale === 'sv' ? 'Juridiska dokument' : 'Legal documents'} className="my-8 flex flex-wrap gap-3 text-sm font-semibold">
            <Link className="rounded-full bg-slate-100 px-4 py-2 hover:bg-slate-200" href={paths[locale].privacy}>{labels.privacy}</Link>
            <Link className="rounded-full bg-slate-100 px-4 py-2 hover:bg-slate-200" href={paths[locale].terms}>{labels.terms}</Link>
            <Link className="rounded-full bg-slate-100 px-4 py-2 hover:bg-slate-200" href={paths[locale].refund}>{labels.refund}</Link>
          </nav>

          <div className="space-y-9 text-[15px] leading-7 text-slate-700 [&_a]:font-semibold [&_a]:text-blue-700 [&_a]:underline [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-slate-900 [&_li]:ml-5 [&_li]:list-disc [&_p+p]:mt-3 [&_ul]:mt-3 [&_ul]:space-y-2">
            {children}
          </div>

          <section className="mt-12 rounded-2xl bg-slate-100 p-6 text-sm leading-6 text-slate-700" aria-labelledby="seller-details">
            <h2 id="seller-details" className="text-lg font-bold text-slate-900">
              {locale === 'sv' ? 'Tjänsteleverantör och kontakt' : 'Service provider and contact'}
            </h2>
            <address className="mt-3 whitespace-pre-line not-italic">
              {seller.name}<br />
              {seller.address}<br />
              {seller.country}<br />
              <a href={`mailto:${seller.email}`}>{seller.email}</a><br />
              <a href={`tel:${seller.phone.replace(/\s/g, '')}`}>{seller.phone}</a>
            </address>
            {seller.registrationNumber && <p className="mt-2">{locale === 'sv' ? 'Registreringsnummer' : 'Registration number'}: {seller.registrationNumber}</p>}
            {seller.vatNumber && <p>{locale === 'sv' ? 'Momsregistreringsnummer' : 'VAT number'}: {seller.vatNumber}</p>}
          </section>
        </article>
      </main>
    </>
  );
}
