import type { Metadata } from 'next';
import { PublishedLegalPage } from '@/components/legal/PublishedLegalPage';
import { BRAND_NAME } from '@/lib/brand';

export const metadata: Metadata = { title: `Användarvillkor — ${BRAND_NAME}` };
export default function TermsPage() { return <PublishedLegalPage kind="terms" locale="sv" />; }
