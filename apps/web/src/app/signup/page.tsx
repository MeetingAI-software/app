import { connection } from 'next/server';
import { SignupPageClient } from '@/components/SignupPageClient';
import { getLegalPublication } from '@/lib/legal';

export default async function SignupPage() {
  await connection();
  const legal = getLegalPublication();
  const registrationEnabled = process.env.PUBLIC_REGISTRATION_ENABLED === 'true';
  return <SignupPageClient legalVersion={registrationEnabled ? legal?.version ?? null : null} />;
}
