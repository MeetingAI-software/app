import Link from 'next/link';
import { BRAND_NAME, PADDLE_BUYER_SUPPORT_URL, SUPPORT_EMAIL } from '@/lib/brand';
import { LogoMark } from '@/components/Logo';

interface PublicFooterProps {
  legalPublished?: boolean;
  compact?: boolean;
}

export function PublicFooter({ legalPublished = false, compact = false }: PublicFooterProps) {
  return (
    <footer
      className={`bg-surface-container-low/90 backdrop-blur-md font-body-md text-body-md w-full ${compact ? 'py-12 border-t border-slate-200' : 'py-section-gap'} content-layer relative z-10`}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter px-margin-page max-w-container-max mx-auto text-left">
        <div className="col-span-1 md:col-span-2 lg:col-span-1 flex flex-col gap-4">
          <Link href="/" className="font-headline-md text-2xl font-bold text-slate-900 flex items-center gap-2 hover:text-secondary transition-colors duration-200">
            <LogoMark />
            {BRAND_NAME}
          </Link>
          <p className="text-on-surface text-sm mt-2">
            &copy; {new Date().getFullYear()} {BRAND_NAME}. All rights reserved. Precise summaries for high-performing teams.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <h4 className="font-label-mono text-[13px] font-bold text-slate-900 uppercase tracking-wider mb-2">Legal</h4>
          {legalPublished ? (
            <>
              <Link className="text-on-tertiary-container hover:text-secondary transition-colors duration-200 text-sm font-medium" href="/privacy">Privacy Policy</Link>
              <Link className="text-on-tertiary-container hover:text-secondary transition-colors duration-200 text-sm font-medium" href="/terms">Terms of Service</Link>
              <Link className="text-on-tertiary-container hover:text-secondary transition-colors duration-200 text-sm font-medium" href="/refund-policy">Refund Policy</Link>
              <a
                className="text-on-tertiary-container hover:text-secondary transition-colors duration-200 text-sm font-medium"
                href={PADDLE_BUYER_SUPPORT_URL}
                aria-label="Exercise withdrawal right through Paddle Buyer Support"
              >
                Exercise withdrawal right
              </a>
            </>
          ) : (
            <p className="text-on-tertiary-container text-sm font-medium">Policies pending publication</p>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <h4 className="font-label-mono text-[13px] font-bold text-slate-900 uppercase tracking-wider mb-2">Contact</h4>
          <a className="text-on-tertiary-container hover:text-secondary transition-colors duration-200 text-sm font-medium" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </div>
        <div className="flex flex-col gap-3">
          <h4 className="font-label-mono text-[13px] font-bold text-slate-900 uppercase tracking-wider mb-2">System</h4>
          <div className="flex items-center gap-2 text-sm text-on-tertiary-container font-medium">
            <div className="w-2 h-2 rounded-full bg-success" />
            All systems operational
          </div>
        </div>
      </div>
    </footer>
  );
}
