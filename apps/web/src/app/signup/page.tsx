import { connection } from 'next/server';
import { SignupPageClient } from '@/components/SignupPageClient';
import { getLegalPublication } from '@/lib/legal';

export default async function SignupPage() {
  await connection();
  return <SignupPageClient legalPublished={getLegalPublication() !== null} />;
}
