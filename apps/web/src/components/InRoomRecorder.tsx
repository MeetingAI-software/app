'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, uploadMeeting } from '@/lib/api';
import { msToClock } from '@/lib/format';
import RecordingConsent from './RecordingConsent';

type Phase = 'idle' | 'recording' | 'recorded' | 'uploading';

/** Prefer Opus in WebM; fall back through what the browser actually supports (Safari uses mp4). */
function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  return preferred.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

function micErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone access was blocked. Allow mic access in your browser, then try again.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No microphone was found. Connect one and try again.';
  }
  return 'Could not start recording. Check your microphone and try again.';
}

export default function InRoomRecorder() {
  const router = useRouter();

  const [names, setNames] = useState<string[]>([]);
  const [nameInput, setNameInput] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [recordingConfirmed, setRecordingConfirmed] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const startRef = useRef<number>(0);

  // Cleanup on unmount — release the mic, the timer, and any object URL. Refs only (no setState).
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  function addName() {
    const name = nameInput.trim();
    if (!name) return;
    if (!names.includes(name)) setNames((prev) => [...prev, name]);
    setNameInput('');
  }

  function removeName(target: string) {
    setNames((prev) => prev.filter((n) => n !== target));
  }

  async function startRecording() {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setError(micErrorMessage(err));
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    const mimeType = pickMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = URL.createObjectURL(blob);
      setAudioBlob(blob);
      setAudioUrl(objectUrlRef.current);
      setPhase('recorded');
      stopStream();
      stopTimer();
    };

    recorder.start();
    setPhase('recording');
    setElapsedMs(0);
    startRef.current = Date.now();
    timerRef.current = setInterval(() => setElapsedMs(Date.now() - startRef.current), 200);
  }

  function stopRecording() {
    recorderRef.current?.stop();
  }

  function discardRecording() {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    setAudioBlob(null);
    setAudioUrl(null);
    setElapsedMs(0);
    setPhase('idle');
  }

  async function handleUpload() {
    if (!audioBlob) return;
    setError(null);
    setProgress(0);
    setPhase('uploading');
    try {
      const meeting = await uploadMeeting(audioBlob, names, setProgress);
      router.push(`/meetings/${meeting.id}`);
    } catch (err) {
      // Keep the recording in state on failure so a verification block doesn't lose their audio.
      if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') {
        setError('Verify your email address before uploading a recording.');
      } else {
        setError(err instanceof Error ? err.message : 'Upload failed.');
      }
      setPhase('recorded');
    }
  }

  const busy = phase === 'uploading';

  return (
    <div className="space-y-6">
      {/* Participant names */}
      <div>
        <label className="block font-label-mono text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-widest">Participant List</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addName();
              }
            }}
            disabled={busy}
            placeholder="Enter name..."
            className="flex-1 bg-white border border-slate-200 rounded-lg px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary/30 transition-colors disabled:opacity-50 text-sm"
          />
          <button
            type="button"
            onClick={addName}
            disabled={busy || !nameInput.trim()}
            className="px-6 py-3 bg-white text-slate-900 border border-slate-200 hover:bg-slate-50 rounded-lg text-sm font-semibold transition-colors shadow-sm cursor-pointer"
          >
            Add
          </button>
        </div>
        {names.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {names.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1.5 bg-slate-100 border border-slate-200 text-slate-700 rounded-full pl-3 pr-2 py-1 text-sm font-medium"
              >
                {name}
                <button
                  type="button"
                  onClick={() => removeName(name)}
                  disabled={busy}
                  aria-label={`Remove ${name}`}
                  className="text-slate-400 hover:text-slate-700 disabled:opacity-50 leading-none text-lg"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-2 font-medium">
          <span className="material-symbols-outlined text-[16px] text-slate-400">info</span>
          <span>Names are matched to speakers in the order they first talk.</span>
        </div>
      </div>

      {/* Recorder */}
      <div className="border-t border-slate-100 pt-6 flex flex-col items-center justify-center gap-4">
        {phase === 'idle' && (
          <div className="w-full space-y-4">
            <RecordingConsent
              id="in-room-recording-consent"
              checked={recordingConfirmed}
              onChange={setRecordingConfirmed}
            />
            <div className="flex justify-center">
              <button
                type="button"
                onClick={startRecording}
                disabled={!recordingConfirmed}
                className="inline-flex items-center gap-2 bg-[#0F172A] hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 text-white rounded-lg px-8 py-3.5 font-bold text-sm transition-all shadow-md hover:shadow-lg cursor-pointer transform hover:-translate-y-0.5"
              >
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                Start Recording Session
              </button>
            </div>
          </div>
        )}

        {phase === 'recording' && (
          <>
            <div className="flex items-center gap-2 text-slate-600 mb-2">
              <span className="inline-block h-3 w-3 rounded-full bg-red-500 animate-pulse" />
              <span className="font-mono text-2xl tabular-nums text-slate-900 font-bold">{msToClock(elapsedMs)}</span>
            </div>
            <button
              type="button"
              onClick={stopRecording}
              className="inline-flex items-center gap-2 bg-[#0F172A] hover:bg-slate-800 text-white rounded-lg px-8 py-3.5 font-bold text-sm transition-all shadow-md hover:shadow-lg cursor-pointer transform hover:-translate-y-0.5"
            >
              Stop recording
            </button>
          </>
        )}

        {phase === 'recorded' && audioUrl && (
          <div className="w-full space-y-4">
            <div className="text-center text-sm text-slate-500 font-medium">
              Recorded {msToClock(elapsedMs)} — have a listen before uploading.
            </div>
            <audio controls src={audioUrl} className="w-full rounded-lg border border-slate-200 p-1 bg-slate-50" />
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleUpload}
                className="flex-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg px-6 py-3 font-semibold text-sm transition-colors shadow-sm cursor-pointer"
              >
                Upload and process
              </button>
              <button
                type="button"
                onClick={discardRecording}
                className="px-6 py-3 bg-white text-slate-900 border border-slate-200 hover:bg-slate-50 rounded-lg text-sm font-semibold transition-colors shadow-sm cursor-pointer"
              >
                Re-record
              </button>
            </div>
          </div>
        )}

        {phase === 'uploading' && (
          <div className="w-full space-y-3">
            <div className="text-center text-sm text-slate-600 font-medium">Uploading… {Math.round(progress * 100)}%</div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
              <div
                className="h-full bg-slate-900 transition-[width] duration-150"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200/50 text-red-700 p-3 rounded-lg text-sm font-medium">{error}</div>
      )}
    </div>
  );
}
