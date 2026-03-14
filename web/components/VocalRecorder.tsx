"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import * as Tone from "tone";
import { RoomSettings, StemType } from "@/lib/types";

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const SCALE_INTERVALS: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

function detectPitch(audioBuffer: AudioBuffer): number | null {
  const data = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const windowSize = 4096;
  const numWindows = 8;
  const pitches: number[] = [];

  for (let w = 0; w < numWindows; w++) {
    const start = Math.floor((data.length / (numWindows + 1)) * (w + 1));
    if (start + windowSize > data.length) continue;
    const window = data.slice(start, start + windowSize);
    let rms = 0;
    for (let i = 0; i < windowSize; i++) rms += window[i] * window[i];
    if (Math.sqrt(rms / windowSize) < 0.02) continue;

    const minOffset = Math.floor(sampleRate / 1500);
    const maxOffset = Math.floor(sampleRate / 60);
    let bestCorr = -1, bestOffset = -1;
    for (let offset = minOffset; offset <= maxOffset; offset++) {
      let corr = 0;
      for (let i = 0; i < windowSize - offset; i++) corr += window[i] * window[i + offset];
      if (corr > bestCorr) { bestCorr = corr; bestOffset = offset; }
    }
    if (bestOffset > 0 && bestCorr > 0) pitches.push(sampleRate / bestOffset);
  }

  if (pitches.length === 0) return null;
  pitches.sort((a, b) => a - b);
  return pitches[Math.floor(pitches.length / 2)];
}

function snapToScale(freq: number, key: string, scale: string): { noteName: string; semitones: number } {
  const midi = 69 + 12 * Math.log2(freq / 440);
  const keyIndex = NOTE_NAMES.indexOf(key as typeof NOTE_NAMES[number]);
  const intervals = SCALE_INTERVALS[scale] ?? SCALE_INTERVALS.major;
  const posInOctave = ((midi - keyIndex) % 12 + 12) % 12;

  let bestInterval = intervals[0], minDist = Infinity;
  for (const interval of intervals) {
    const d = Math.min(
      Math.abs(posInOctave - interval),
      Math.abs(posInOctave - interval + 12),
      Math.abs(posInOctave - interval - 12)
    );
    if (d < minDist) { minDist = d; bestInterval = interval; }
  }

  let semitones = Math.round(bestInterval - posInOctave);
  if (semitones > 6) semitones -= 12;
  if (semitones < -6) semitones += 12;
  const targetMidi = Math.round(midi) + semitones;
  const noteName = NOTE_NAMES[((targetMidi % 12) + 12) % 12];
  return { noteName, semitones };
}

async function pitchShiftBlob(blob: Blob, semitones: number): Promise<Blob> {
  if (semitones === 0) return blob;
  const ratio = Math.pow(2, semitones / 12);
  const arrayBuffer = await blob.arrayBuffer();
  const tempCtx = new AudioContext();
  const sourceBuffer = await tempCtx.decodeAudioData(arrayBuffer);
  await tempCtx.close();
  const offlineCtx = new OfflineAudioContext(
    sourceBuffer.numberOfChannels,
    Math.ceil(sourceBuffer.length / ratio),
    sourceBuffer.sampleRate
  );
  const source = offlineCtx.createBufferSource();
  source.buffer = sourceBuffer;
  source.playbackRate.value = ratio;
  source.connect(offlineCtx.destination);
  source.start(0);
  return audioBufferToWavBlob(await offlineCtx.startRendering());
}

function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numSamples = buffer.length;
  const dataLength = numSamples * numChannels * 2;
  const ab = new ArrayBuffer(44 + dataLength);
  const view = new DataView(ab);
  const ws = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  ws(0, 'RIFF'); view.setUint32(4, 36 + dataLength, true);
  ws(8, 'WAVE'); ws(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true); view.setUint16(34, 16, true);
  ws(36, 'data'); view.setUint32(40, dataLength, true);
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}

interface Props {
  settings: RoomSettings;
  roomCode: string;
  onPush: (audioUrl: string, name: string, stemType: StemType) => void;
}

type Status = 'idle' | 'waiting' | 'recording' | 'analyzing' | 'recorded' | 'processing' | 'done';

export default function VocalRecorder({ settings, roomCode, onPush }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [micReady, setMicReady] = useState(false);
  const [loopProgress, setLoopProgress] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [detectedNote, setDetectedNote] = useState<string | null>(null);
  const [semitones, setSemitones] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const waitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number>(0);
  const statusRef = useRef<Status>('idle');

  // Keep statusRef in sync
  useEffect(() => { statusRef.current = status; }, [status]);

  const loopDuration = (settings.barCount * 4 * 60) / settings.bpm;

  // Pre-warm mic on mount
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then(stream => {
        streamRef.current = stream;
        setMicReady(true);
      })
      .catch(() => setError('Microphone access denied. Allow mic access and try again.'));

    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (waitTimerRef.current) clearTimeout(waitTimerRef.current);
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Loop progress bar via rAF
  useEffect(() => {
    const tick = () => {
      const transport = Tone.getTransport();
      if (transport.state === 'started') {
        const pos = transport.seconds % loopDuration;
        setLoopProgress(pos / loopDuration);
        if (statusRef.current === 'waiting') {
          setCountdown(Math.ceil(loopDuration - pos));
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [loopDuration]);

  const beginRecording = useCallback(() => {
    if (!streamRef.current) return;
    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
    const recorder = new MediaRecorder(streamRef.current, { mimeType });
    chunksRef.current = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      blobRef.current = new Blob(chunksRef.current, { type: mimeType });
      analyzePitch(blobRef.current);
    };
    mediaRecorderRef.current = recorder;
    recorder.start(100);
    setStatus('recording');

    // Auto-stop after exactly one loop
    stopTimerRef.current = setTimeout(() => {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
        setStatus('analyzing');
      }
    }, loopDuration * 1000);
  }, [loopDuration]);

  const scheduleRecord = useCallback(() => {
    setError(null);
    if (!micReady) { setError('Microphone not ready yet.'); return; }

    const transport = Tone.getTransport();
    const pos = transport.seconds % loopDuration;
    const msUntilBoundary = (loopDuration - pos) * 1000;

    // If within 150ms of boundary, start immediately
    if (msUntilBoundary < 150) {
      beginRecording();
    } else {
      setStatus('waiting');
      waitTimerRef.current = setTimeout(() => beginRecording(), msUntilBoundary);
    }
  }, [micReady, loopDuration, beginRecording]);

  const cancelWait = () => {
    if (waitTimerRef.current) clearTimeout(waitTimerRef.current);
    setStatus('idle');
  };

  const stopEarly = () => {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      setStatus('analyzing');
    }
  };

  const analyzePitch = async (blob: Blob) => {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const audioCtx = new AudioContext();
      const decoded = await audioCtx.decodeAudioData(arrayBuffer);
      await audioCtx.close();
      const freq = detectPitch(decoded);
      if (freq && freq > 60 && freq < 1500) {
        const { noteName, semitones: st } = snapToScale(freq, settings.key, settings.scale);
        setDetectedNote(noteName);
        setSemitones(st);
      } else {
        setDetectedNote(null);
        setSemitones(0);
      }
    } catch {
      setDetectedNote(null);
      setSemitones(0);
    }
    setStatus('recorded');
  };

  const pushToMaster = async () => {
    if (!blobRef.current) return;
    setStatus('processing');
    setError(null);
    try {
      const shifted = await pitchShiftBlob(blobRef.current, semitones);
      const formData = new FormData();
      formData.append('file', shifted, 'vocals.wav');
      formData.append('roomCode', roomCode);
      const res = await fetch('/api/autotune', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.details || err.error || 'Upload failed');
      }
      const { url } = await res.json();
      onPush(url, 'Vocal Take', 'vocals');
      setStatus('done');
      blobRef.current = null;
      setDetectedNote(null);
      setSemitones(0);
      setTimeout(() => setStatus('idle'), 1500);
    } catch (err: any) {
      setError(err.message);
      setStatus('recorded');
    }
  };

  const discard = () => {
    blobRef.current = null;
    setDetectedNote(null);
    setSemitones(0);
    setStatus('idle');
    setError(null);
  };

  // Loop progress bar segments (one per bar)
  const bars = Array.from({ length: settings.barCount });
  const barProgress = loopProgress * settings.barCount;

  return (
    <div className="space-y-5">
      <p className="text-gray-400 text-sm">
        Record vocals — snapped to {settings.key} {settings.scale} · {settings.barCount} bars
      </p>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-2 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Loop progress bar */}
      <div className="flex gap-0.5">
        {bars.map((_, i) => {
          const fill = Math.max(0, Math.min(1, barProgress - i));
          return (
            <div key={i} className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-none ${
                  status === 'recording' ? 'bg-red-500' : 'bg-gray-600'
                }`}
                style={{ width: `${fill * 100}%` }}
              />
            </div>
          );
        })}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 flex flex-col items-center gap-5">
        {status === 'idle' && (
          <>
            <button
              onClick={scheduleRecord}
              disabled={!micReady}
              className="w-20 h-20 rounded-full bg-red-600 hover:bg-red-500 disabled:bg-gray-700 disabled:text-gray-500 transition flex items-center justify-center shadow-lg shadow-red-900/50 text-3xl"
            >
              🎤
            </button>
            <p className="text-gray-500 text-sm">
              {micReady ? 'Click to record — starts on next loop' : 'Initializing mic...'}
            </p>
          </>
        )}

        {status === 'waiting' && (
          <>
            <div className="w-20 h-20 rounded-full border-2 border-red-600 flex items-center justify-center">
              <span className="font-mono text-2xl text-red-400">{countdown}</span>
            </div>
            <p className="text-gray-400 text-sm">Waiting for loop start...</p>
            <button onClick={cancelWait} className="text-gray-600 hover:text-gray-400 text-xs transition">
              Cancel
            </button>
          </>
        )}

        {status === 'recording' && (
          <>
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 rounded-full bg-red-600 animate-ping opacity-30" />
              <div className="relative w-20 h-20 rounded-full bg-red-600 flex items-center justify-center">
                <div className="w-7 h-7 bg-white rounded-sm" />
              </div>
            </div>
            <p className="text-red-400 text-sm font-mono animate-pulse">Recording...</p>
            <button
              onClick={stopEarly}
              className="text-gray-600 hover:text-gray-400 text-xs transition"
            >
              Stop early
            </button>
          </>
        )}

        {status === 'analyzing' && (
          <p className="text-gray-400 text-sm animate-pulse">Analyzing pitch...</p>
        )}

        {(status === 'recorded' || status === 'processing') && (
          <div className="w-full space-y-5">
            <div className="flex flex-col items-center gap-1">
              {detectedNote ? (
                <>
                  <p className="text-gray-500 text-xs">Snapping to nearest scale note</p>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-2xl font-bold text-purple-400">{detectedNote}</span>
                    {semitones !== 0 && (
                      <span className="text-gray-600 text-sm">
                        ({semitones > 0 ? '+' : ''}{semitones} st)
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-gray-500 text-sm">No clear pitch detected — uploading as-is</p>
              )}
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={discard}
                disabled={status === 'processing'}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 rounded-lg text-sm transition"
              >
                Discard
              </button>
              <button
                onClick={pushToMaster}
                disabled={status === 'processing'}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-semibold transition"
              >
                {status === 'processing' ? 'Processing...' : 'Push to Master'}
              </button>
            </div>
          </div>
        )}

        {status === 'done' && (
          <p className="text-green-400 font-medium">Pushed to master!</p>
        )}
      </div>

      <p className="text-gray-600 text-xs text-center">
        Voice isolation powered by ElevenLabs · pitch snapped to {settings.key} {settings.scale}
      </p>
    </div>
  );
}
