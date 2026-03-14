"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import * as Tone from "tone";
import { RoomSettings, StemType } from "@/lib/types";

interface Props {
  settings: RoomSettings;
  roomCode: string;
  onPreview: (audioUrl: string) => Promise<void>;
  onPush: (audioUrl: string, name: string, stemType: StemType) => void;
}

type SynthType = "synth" | "fm" | "am" | "pluck";

const SYNTH_TYPES: { value: SynthType; label: string }[] = [
  { value: "synth", label: "Classic" },
  { value: "fm", label: "FM" },
  { value: "am", label: "AM" },
  { value: "pluck", label: "Pluck" },
];

const KEY_NOTE_MAP: Record<string, string> = {
  a: "C4", w: "C#4", s: "D4", e: "D#4", d: "E4", f: "F4",
  t: "F#4", g: "G4", y: "G#4", h: "A4", u: "A#4", j: "B4",
  k: "C5", o: "C#5", l: "D5", p: "D#5",
};

const PIANO_KEYS = [
  { note: "C4", black: false }, { note: "C#4", black: true },
  { note: "D4", black: false }, { note: "D#4", black: true },
  { note: "E4", black: false }, { note: "F4", black: false },
  { note: "F#4", black: true }, { note: "G4", black: false },
  { note: "G#4", black: true }, { note: "A4", black: false },
  { note: "A#4", black: true }, { note: "B4", black: false },
  { note: "C5", black: false }, { note: "C#5", black: true },
  { note: "D5", black: false }, { note: "D#5", black: true },
  { note: "E5", black: false },
];

export default function SynthPlayer({ settings, roomCode, onPreview, onPush }: Props) {
  const [synthType, setSynthType] = useState<SynthType>("synth");
  const [isRecording, setIsRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [activeNotes, setActiveNotes] = useState<Set<string>>(new Set());
  const synthRef = useRef<Tone.PolySynth | null>(null);
  const recorderRef = useRef<Tone.Recorder | null>(null);

  useEffect(() => {
    if (synthRef.current) synthRef.current.dispose();

    const synthOptions: Record<SynthType, () => Tone.PolySynth> = {
      synth: () => new Tone.PolySynth(Tone.Synth),
      fm: () => new Tone.PolySynth(Tone.FMSynth),
      am: () => new Tone.PolySynth(Tone.AMSynth),
      pluck: () => new Tone.PolySynth(Tone.PluckSynth as any),
    };

    synthRef.current = synthOptions[synthType]().toDestination();
    return () => { synthRef.current?.dispose(); };
  }, [synthType]);

  const noteOn = useCallback((note: string) => {
    synthRef.current?.triggerAttack(note);
    setActiveNotes((prev) => new Set(prev).add(note));
  }, []);

  const noteOff = useCallback((note: string) => {
    synthRef.current?.triggerRelease(note);
    setActiveNotes((prev) => {
      const next = new Set(prev);
      next.delete(note);
      return next;
    });
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const note = KEY_NOTE_MAP[e.key.toLowerCase()];
      if (note) noteOn(note);
    };
    const up = (e: KeyboardEvent) => {
      const note = KEY_NOTE_MAP[e.key.toLowerCase()];
      if (note) noteOff(note);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [noteOn, noteOff]);

  const startRecording = async () => {
    await Tone.start();
    const recorder = new Tone.Recorder();
    recorderRef.current = recorder;
    synthRef.current?.connect(recorder);
    recorder.start();
    setIsRecording(true);
    setRecordedUrl(null);

    const loopDuration = (settings.barCount * 4 * 60) / settings.bpm;
    setTimeout(async () => {
      const recording = await recorder.stop();
      const blob = new Blob([recording], { type: "audio/webm" });

      const formData = new FormData();
      formData.append("file", blob, "synth-recording.webm");
      formData.append("roomCode", roomCode);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const { url } = await res.json();
      setRecordedUrl(url);
      setIsRecording(false);
    }, loopDuration * 1000);
  };

  return (
    <div className="space-y-6">
      <p className="text-gray-400 text-sm">
        Play synths with your keyboard (A-L keys = notes) or click the piano.
        Record a {settings.barCount}-bar loop.
      </p>

      <div className="flex gap-2">
        {SYNTH_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => setSynthType(t.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition
              ${synthType === t.value ? "bg-purple-600" : "bg-gray-900 text-gray-400"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex relative h-32 select-none">
        {PIANO_KEYS.filter((k) => !k.black).map((key) => (
          <button
            key={key.note}
            onMouseDown={() => noteOn(key.note)}
            onMouseUp={() => noteOff(key.note)}
            onMouseLeave={() => noteOff(key.note)}
            className={`flex-1 border border-gray-700 rounded-b-lg flex items-end justify-center pb-2 text-xs transition
              ${activeNotes.has(key.note)
                ? "bg-purple-400 text-black"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            {key.note.replace("4", "").replace("5", "")}
          </button>
        ))}
        {PIANO_KEYS.filter((k) => k.black).map((key) => {
          const whiteIndex = PIANO_KEYS.filter((k) => !k.black).findIndex(
            (wk) => wk.note === key.note.replace("#", "")
          );
          const leftPercent = ((whiteIndex + 0.65) / PIANO_KEYS.filter((k) => !k.black).length) * 100;
          return (
            <button
              key={key.note}
              onMouseDown={() => noteOn(key.note)}
              onMouseUp={() => noteOff(key.note)}
              onMouseLeave={() => noteOff(key.note)}
              className={`absolute top-0 w-[6%] h-20 rounded-b-md z-10 text-xs transition
                ${activeNotes.has(key.note)
                  ? "bg-purple-600 text-white"
                  : "bg-gray-900 text-gray-400 hover:bg-gray-800"}`}
              style={{ left: `${leftPercent}%` }}
            />
          );
        })}
      </div>

      <div className="flex gap-3 items-center">
        <button
          onClick={startRecording}
          disabled={isRecording}
          className={`px-6 py-3 rounded-lg font-semibold transition
            ${isRecording
              ? "bg-red-700 animate-pulse"
              : "bg-red-600 hover:bg-red-500"}`}
        >
          {isRecording ? `Recording (${settings.barCount} bars)...` : "Record Loop"}
        </button>
        {isRecording && (
          <span className="text-red-400 text-sm">Play your part now!</span>
        )}
      </div>

      {recordedUrl && (
        <div className="bg-gray-900 rounded-lg p-4 flex gap-2">
          <button
            onClick={() => onPreview(recordedUrl)}
            className="flex-1 py-2 bg-yellow-600 hover:bg-yellow-500 rounded-lg text-sm font-medium"
          >
            Preview
          </button>
          <button
            onClick={() => startRecording()}
            className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium"
          >
            Re-record
          </button>
          <button
            onClick={() => onPush(recordedUrl, `Synth (${synthType})`, "melody")}
            className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-medium"
          >
            Push to Master
          </button>
        </div>
      )}
    </div>
  );
}
