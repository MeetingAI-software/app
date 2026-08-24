import type { Metadata } from 'next';
import { getShare, type ShareResponse } from '@/lib/api';
import SharePageClient from '@/components/SharePageClient';
import { BRAND_NAME } from '@/lib/brand';

interface Props {
  params: Promise<{ token: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  // Never place meeting content in crawler/social-preview metadata: unfurling a copied URL must
  // not copy transcript-derived text into chat providers, search engines or their caches.
  return {
    title: `Shared meeting | ${BRAND_NAME}`,
    description: 'Private meeting notes shared through a time-limited link.',
    robots: { index: false, follow: false, noarchive: true, nosnippet: true },
  };
}

type SharePageResult =
  | { ok: true; data: ShareResponse }
  | { ok: false; message: string };

async function loadSharePage(token: string): Promise<SharePageResult> {
  try {
    return { ok: true, data: await getShare(token) };
  } catch (error: unknown) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'This link may have expired or is invalid.',
    };
  }
}

export default async function PublicSharePage({ params }: Props) {
  const { token } = await params;
  const result = await loadSharePage(token);

  if (result.ok) return <SharePageClient initialData={result.data} />;

  return (
    <div className="min-h-screen bg-[#0d0f12] text-gray-100 flex items-center justify-center p-6">
      <div className="bg-[#13171c] border border-gray-800 rounded-2xl p-8 max-w-md w-full text-center">
        <div className="text-red-500 text-4xl mb-4">⚠️</div>
        <h1 className="text-xl font-bold text-white mb-2">Not Found</h1>
        <p className="text-gray-400 mb-6">{result.message}</p>
        <p className="text-xs text-gray-600">{BRAND_NAME} public portal</p>
      </div>
    </div>
  );
}
