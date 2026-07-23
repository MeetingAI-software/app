import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing & Plans — Meeting AI',
  description: 'Transparent pricing for Meeting AI. 100% EU data residency in Frankfurt and Stockholm. No hidden fees.',
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
