import { connection } from 'next/server';
import { LoginPageClient } from '@/components/LoginPageClient';
import { getLegalPublication } from '@/lib/legal';

export default async function LoginPage() {
  await connection();
  return <LoginPageClient legalPublished={getLegalPublication() !== null} />;
}
