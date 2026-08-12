import type { DocumentGeneratorPort } from '../../ports/document-generator.port';
import type { DocumentContent } from '../../domain/document';
import type { TranscriptSegment } from '../../domain/types';

const CANNED_SUMMARY =
  'The team reviewed progress on the Syncmemos backend pipeline. AbdulRehman finished the Recall.ai adapter and Alper completed the database and Express layers. Both halves were wired together and tested against the Frankfurt Postgres instance. The pipeline now runs end to end, so the team agreed to move on to the document generation work.';

const CANNED_CONTENT: DocumentContent = {
  title: 'Syncmemos Backend Sync — 16 Jul 2026',
  missed5: [
    'The Recall.ai adapter is done and wired behind the MeetingBotPort, so switching bot vendors later means writing one new adapter rather than touching the application layer.',
    'The database and Express layers are complete, running against Supabase Postgres in Frankfurt, which keeps the GDPR wedge intact.',
    'The full pipeline was proven end to end: posting a Zoom link produces a transcript with speakers and timestamps in Postgres, and usage is metered against the monthly cap.',
    'Integration tests pass against the Frankfurt database, so the team is unblocked to start Day 2 document generation.',
    'Audio deletion at the provider was agreed as the next GDPR milestone, gated on the transcript being safely stored first.',
  ],
  decisions: [
    'Ship the Recall.ai adapter behind the existing MeetingBotPort rather than calling the vendor from the application layer.',
    'Keep Supabase Postgres in Frankfurt as the primary datastore for the GDPR positioning.',
    'Delete provider-side audio only after the transcript is stored and the summary has been generated.',
  ],
  actionPoints: [
    {
      task: 'Wire the Claude adapter behind DocumentGeneratorPort and flip DOC_PROVIDER to claude.',
      owner: 'AbdulRehman Khan',
      deadlineIso: '2026-07-18',
    },
    {
      task: 'Run the Day 2 migration adding summary, share_token, and the documents table changes.',
      owner: 'Alper Eken',
      deadlineIso: '2026-07-17',
    },
    {
      task: 'Build the public share page and confirm it never leaks the meeting URL or bot ID.',
      owner: 'Alper Eken',
      deadlineIso: null,
    },
    {
      task: 'Hold a real Zoom meeting end to end and verify the recording is deleted at Recall.',
      owner: 'AbdulRehman Khan',
      deadlineIso: null,
    },
  ],
  openQuestions: [
    'Whether a background sweep job is needed for recordings whose deletion call failed.',
    'Which pricing tier the monthly cap of four hours should map to once real customers arrive.',
  ],
};

export class FakeDocumentGenerator implements DocumentGeneratorPort {
  async generateSummary(_segments: TranscriptSegment[]): Promise<string> {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return CANNED_SUMMARY;
  }

  async generateDocument(
    _segments: TranscriptSegment[],
    _meta: { meetingIsoDate: string }
  ): Promise<{
    content: DocumentContent;
    model: string;
    inputTokens: number;
    outputTokens: number;
  }> {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return {
      content: structuredClone(CANNED_CONTENT),
      model: 'fake',
      inputTokens: 0,
      outputTokens: 0,
    };
  }
}
