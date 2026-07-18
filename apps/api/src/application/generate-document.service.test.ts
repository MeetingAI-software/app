import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GenerateDocumentService } from './generate-document.service';
import { FakeDocumentGenerator } from '../adapters/fake/fake-document.generator';
import { MeetingNotReadyError } from '../domain/errors';
import type {
  DocumentRepository,
  MeetingRepository,
  TranscriptRepository,
} from '../ports/repositories.port';
import type { Meeting, MeetingStatus, TranscriptSegment } from '../domain/types';
import type { DocumentContent } from '../domain/document';

const SEGMENTS: TranscriptSegment[] = [
  { startMs: 0, endMs: 2000, speaker: 'Alper Eken', text: 'Welcome.' },
  { startMs: 2500, endMs: 5000, speaker: 'AbdulRehman Khan', text: 'Adapter is done.' },
];

function meetingWith(status: MeetingStatus): Meeting {
  return {
    id: 'meeting-1',
    meetingUrl: 'https://zoom.us/j/123',
    platform: 'zoom',
    status,
    source: 'bot',
    botId: 'bot-1',
    durationSeconds: 18,
    errorMessage: null,
    summary: null,
    shareToken: 'tok_abc',
    participantNames: null,
    audioStoragePath: null,
    transcriptionJobId: null,
    createdAt: new Date('2026-07-16T10:00:00Z'),
    updatedAt: new Date('2026-07-16T10:00:00Z'),
  };
}

describe('GenerateDocumentService', () => {
  let meetingRepo: MeetingRepository;
  let transcriptRepo: TranscriptRepository;
  let documentRepo: DocumentRepository;
  let service: GenerateDocumentService;
  let docGen: FakeDocumentGenerator;

  beforeEach(() => {
    vi.useFakeTimers();

    meetingRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByBotId: vi.fn(),
      findByShareToken: vi.fn(),
      updateStatus: vi.fn(),
      setSummary: vi.fn(),
      countActive: vi.fn(),
      list: vi.fn(),
    };
    transcriptRepo = { save: vi.fn(), getByMeetingId: vi.fn() };
    documentRepo = { upsertForMeeting: vi.fn(), getByMeetingId: vi.fn() };

    docGen = new FakeDocumentGenerator();
    service = new GenerateDocumentService(meetingRepo, transcriptRepo, documentRepo, docGen);
  });

  /** The fake generator sleeps 2s by design; run timers while the promise is in flight. */
  async function resolveWithTimers<T>(promise: Promise<T>): Promise<T> {
    await vi.runAllTimersAsync();
    return promise;
  }

  it('generates and persists a document for a transcribed meeting', async () => {
    vi.mocked(meetingRepo.findById).mockResolvedValue(meetingWith('transcribed'));
    vi.mocked(documentRepo.getByMeetingId)
      .mockResolvedValueOnce(null) // no existing document
      .mockResolvedValueOnce({ content: {} as DocumentContent, createdAt: new Date('2026-07-16T11:00:00Z') });
    vi.mocked(transcriptRepo.getByMeetingId).mockResolvedValue(SEGMENTS);
    vi.mocked(documentRepo.upsertForMeeting).mockResolvedValue({ id: 'doc-1' });

    const result = await resolveWithTimers(service.generate('meeting-1'));

    expect(result.generated).toBe(true);
    expect(result.content.missed5.length).toBeGreaterThanOrEqual(3);
    expect(result.content.missed5.length).toBeLessThanOrEqual(5);
    expect(documentRepo.upsertForMeeting).toHaveBeenCalledWith(
      'meeting-1',
      result.content,
      { model: 'fake', inputTokens: 0, outputTokens: 0 }
    );
  });

  it('passes the meeting date to the generator as an ISO date', async () => {
    vi.mocked(meetingRepo.findById).mockResolvedValue(meetingWith('transcribed'));
    vi.mocked(documentRepo.getByMeetingId).mockResolvedValue(null);
    vi.mocked(transcriptRepo.getByMeetingId).mockResolvedValue(SEGMENTS);
    vi.mocked(documentRepo.upsertForMeeting).mockResolvedValue({ id: 'doc-1' });
    const spy = vi.spyOn(docGen, 'generateDocument');

    await resolveWithTimers(service.generate('meeting-1'));

    expect(spy).toHaveBeenCalledWith(SEGMENTS, { meetingIsoDate: '2026-07-16' });
  });

  it('returns the existing document without regenerating', async () => {
    const existing = { content: { title: 'Existing' } as DocumentContent, createdAt: new Date() };
    vi.mocked(meetingRepo.findById).mockResolvedValue(meetingWith('transcribed'));
    vi.mocked(documentRepo.getByMeetingId).mockResolvedValue(existing);
    const spy = vi.spyOn(docGen, 'generateDocument');

    const result = await resolveWithTimers(service.generate('meeting-1'));

    expect(result.generated).toBe(false);
    expect(result.content).toBe(existing.content);
    expect(spy).not.toHaveBeenCalled();
    expect(documentRepo.upsertForMeeting).not.toHaveBeenCalled();
  });

  it('regenerates and replaces when regenerate is true', async () => {
    const existing = { content: { title: 'Stale' } as DocumentContent, createdAt: new Date() };
    vi.mocked(meetingRepo.findById).mockResolvedValue(meetingWith('transcribed'));
    vi.mocked(documentRepo.getByMeetingId).mockResolvedValue(existing);
    vi.mocked(transcriptRepo.getByMeetingId).mockResolvedValue(SEGMENTS);
    vi.mocked(documentRepo.upsertForMeeting).mockResolvedValue({ id: 'doc-1' });

    const result = await resolveWithTimers(service.generate('meeting-1', true));

    expect(result.generated).toBe(true);
    expect(result.content.title).not.toBe('Stale');
    expect(documentRepo.upsertForMeeting).toHaveBeenCalledTimes(1);
  });

  it.each<MeetingStatus>(['pending', 'bot_joining', 'recording', 'processing', 'failed'])(
    'throws MeetingNotReadyError (409) when the meeting is %s',
    async (status) => {
      vi.mocked(meetingRepo.findById).mockResolvedValue(meetingWith(status));

      await expect(service.generate('meeting-1')).rejects.toThrow(MeetingNotReadyError);
      expect(documentRepo.upsertForMeeting).not.toHaveBeenCalled();
    }
  );

  it('throws MeetingNotReadyError when the meeting does not exist', async () => {
    vi.mocked(meetingRepo.findById).mockResolvedValue(null);

    await expect(service.generate('nope')).rejects.toThrow(MeetingNotReadyError);
  });

  it('throws MeetingNotReadyError when the transcript is empty', async () => {
    vi.mocked(meetingRepo.findById).mockResolvedValue(meetingWith('transcribed'));
    vi.mocked(documentRepo.getByMeetingId).mockResolvedValue(null);
    vi.mocked(transcriptRepo.getByMeetingId).mockResolvedValue([]);

    await expect(service.generate('meeting-1')).rejects.toThrow(MeetingNotReadyError);
    expect(documentRepo.upsertForMeeting).not.toHaveBeenCalled();
  });
});
