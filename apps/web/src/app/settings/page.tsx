import { connection } from 'next/server';
import { SettingsPageClient } from '@/components/SettingsPageClient';
import { getLegalPublication } from '@/lib/legal';

export default async function SettingsPage() {
  await connection();

  return <SettingsPageClient legalPublished={getLegalPublication() !== null} />;
}
