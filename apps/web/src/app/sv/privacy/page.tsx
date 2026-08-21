import type { Metadata } from 'next';
import { PublishedLegalPage } from '@/components/legal/PublishedLegalPage';
import { BRAND_NAME } from '@/lib/brand';

export const metadata: Metadata = { title: `Integritetspolicy — ${BRAND_NAME}` };
export default function PrivacyPage() { return <PublishedLegalPage kind="privacy" locale="sv" />; }
