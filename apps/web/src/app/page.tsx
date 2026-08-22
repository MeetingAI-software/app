import { connection } from 'next/server';
import { LandingPageClient } from '@/components/LandingPageClient';
import { getLegalPublication } from '@/lib/legal';

export default async function Home() {
  await connection();
  return <LandingPageClient legalPublished={getLegalPublication() !== null} />;
}
