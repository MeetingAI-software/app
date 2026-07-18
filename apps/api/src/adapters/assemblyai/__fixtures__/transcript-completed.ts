/**
 * A realistic AssemblyAI `GET /v2/transcript/{id}` response with `speaker_labels: true`, completed.
 * Timestamps are in milliseconds; speakers are single letters ("A", "B"). Used to anchor the
 * normalizer + adapter tests to the real provider shape.
 */
export const completedTranscriptFixture = {
  id: 'transcript-abc123',
  status: 'completed',
  error: null,
  audio_duration: 32,
  language_code: 'en',
  text: 'Okay, let us kick off the in-room sync. Where are we on the AssemblyAI upload path? Recording in the browser works and the file uploads to Supabase Storage. The worker submits it for transcription. Good. And we delete the audio after the summary succeeds, so the GDPR promise holds? Yes, same rule as the Recall path. Transcript is the source of truth, audio gets deleted.',
  utterances: [
    {
      speaker: 'A',
      start: 0,
      end: 3500,
      text: 'Okay, let us kick off the in-room sync. Where are we on the AssemblyAI upload path?',
    },
    {
      speaker: 'B',
      start: 4000,
      end: 9000,
      text: 'Recording in the browser works and the file uploads to Supabase Storage. The worker submits it for transcription.',
    },
    {
      speaker: 'A',
      start: 9500,
      end: 14000,
      text: 'Good. And we delete the audio after the summary succeeds, so the GDPR promise holds?',
    },
    {
      speaker: 'B',
      start: 14500,
      end: 18000,
      text: 'Yes, same rule as the Recall path. Transcript is the source of truth, audio gets deleted.',
    },
  ],
};
