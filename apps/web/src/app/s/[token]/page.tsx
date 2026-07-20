import type { Metadata } from 'next';
import { getShare } from '@/lib/api';
import SharePageClient from '@/components/SharePageClient';

interface Props {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  try {
    const data = await getShare(token);
    const title = data.document?.content.title || 'Meeting Notes';
    const firstMissed = data.document?.content.missed5?.[0] || '';
    const description = firstMissed
      ? `1. ${firstMissed}`
      : data.meeting.summary || 'Catch-up document for this meeting.';

    return {
      title: `${title} | MeetingAI`,
      description,
      openGraph: {
        title,
        description,
        type: 'website',
      },
    };
  } catch {
    return {
      title: 'Meeting Notes | MeetingAI',
      description: 'View shared meeting notes',
    };
  }
}

export default async function PublicSharePage({ params }: Props) {
  const { token } = await params;
  try {
    const shareData = await getShare(token);
    return <SharePageClient initialData={shareData} token={token} />;
  } catch (err: any) {
    return (
      <div className="min-h-screen bg-[#0d0f12] text-gray-100 flex items-center justify-center p-6">
        <div className="bg-[#13171c] border border-gray-800 rounded-2xl p-8 max-w-md w-full text-center">
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold text-white mb-2">Not Found</h1>
          <p className="text-gray-400 mb-6">{err.message || 'This link may have expired or is invalid.'}</p>
          <p className="text-xs text-gray-600">MeetingAI public portal</p>
        </div>
      </div>
    );
  }
}
