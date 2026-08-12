import type { Metadata } from 'next';
import { BRAND_NAME } from '@/lib/brand';

export const metadata: Metadata = {
  title: `Pricing & Plans — ${BRAND_NAME}`,
  description: `Transparent pricing for ${BRAND_NAME}, with clear plan limits and no hidden fees.`,
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
