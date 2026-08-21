import type { Metadata } from 'next';
import { PublishedLegalPage } from '@/components/legal/PublishedLegalPage';
import { BRAND_NAME } from '@/lib/brand';

export const metadata: Metadata = { title: `Refund Policy — ${BRAND_NAME}` };
export default function RefundPolicyPage() { return <PublishedLegalPage kind="refund" locale="en" />; }

