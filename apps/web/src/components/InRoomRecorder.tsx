'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { uploadMeeting } from '@/lib/api';
import { msToClock } from '@/lib/format';

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
      setError(err instanceof Error ? err.message : 'Upload failed.');
      setPhase('recorded');
    }
  }

  const busy = phase === 'uploading';

  return (
    <div className="space-y-6">
      {/* Participant names */}
      <div>
        <label className="block text-sm font-semibold text-gray-300 mb-2">Who is in the room?</label>
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
            placeholder="Add a name and press Enter"
            className="flex-1 bg-[#0d0f12] border border-gray-800 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50 text-sm"
          />
          <button
            type="button"
            onClick={addName}
            disabled={busy || !nameInput.trim()}
            className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            Add
          </button>
        </div>
        {names.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {names.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 rounded-full pl-3 pr-2 py-1 text-sm"
              >
                {name}
                <button
                  type="button"
                  onClick={() => removeName(name)}
                  disabled={busy}
                  aria-label={`Remove ${name}`}
                  className="text-indigo-300 hover:text-white disabled:opacity-50 leading-none text-lg"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-600 mt-2">
          Names are matched to speakers in the order they first talk. Extra speakers stay labelled generically.
        </p>
      </div>

      {/* Recorder */}
      <div className="bg-[#0d0f12] border border-gray-800 rounded-xl p-6 flex flex-col items-center gap-4">
        {phase === 'idle' && (
          <button
            type="button"
            onClick={startRecording}
            className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white rounded-xl px-6 py-3 font-semibold text-sm transition-colors"
          >
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-white" />
            Start recording
          </button>
        )}

        {phase === 'recording' && (
          <>
            <div className="flex items-center gap-2 text-gray-300">
              <span className="inline-block h-3 w-3 rounded-full bg-red-500 animate-pulse" />
              <span className="font-mono text-2xl tabular-nums text-white">{msToClock(elapsedMs)}</span>
            </div>
            <button
              type="button"
              onClick={stopRecording}
              className="bg-gray-800 hover:bg-gray-700 text-white rounded-xl px-6 py-3 font-semibold text-sm transition-colors"
            >
              Stop recording
            </button>
          </>
        )}

        {phase === 'recorded' && audioUrl && (
          <div className="w-full space-y-4">
            <div className="text-center text-sm text-gray-400">
              Recorded {msToClock(elapsedMs)} — have a listen before uploading.
            </div>
            <audio controls src={audioUrl} className="w-full" />
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleUpload}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-6 py-3 font-semibold text-sm transition-colors"
              >
                Upload and process
              </button>
              <button
                type="button"
                onClick={discardRecording}
                className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                Re-record
              </button>
            </div>
          </div>
        )}

        {phase === 'uploading' && (
          <div className="w-full space-y-3">
            <div className="text-center text-sm text-gray-300">Uploading… {Math.round(progress * 100)}%</div>
            <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 transition-[width] duration-150"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-950/50 border border-red-900/50 text-red-200 p-3 rounded-xl text-sm">{error}</div>
      )}
    </div>
  );
}
