"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import * as Tone from "tone";
import { RoomSettings, StemType } from "../../shared/types";
import { STEM_TYPES, STEM_COLORS } from "@/lib/constants";

interface Props {
  settings: RoomSettings;
  roomCode: string;
  onPreview: (audioUrl: string) => Promise<void>;
  onPush: (audioUrl: string, name: string, stemType: StemType) => void;
}

const STEPS = 16;
const PAD_COUNT = 4;

export default function SamplerPads({ settings, roomCode, onPreview, onPush }: Props) {
  const [sampleQuery, setSampleQuery] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [samples, setSamples] = useState<(string | null)[]>(Array(PAD_COUNT).fill(null));
  const [activePad, setActivePad] = useState(0);
  const [grid, setGrid] = useState<boolean[][]>(
    Array(PAD_COUNT).fill(null).map(() => Array(STEPS).fill(false))
  );
  const [stemType, setStemType] = useState<StemType>("drums");
  const [isRecording, setIsRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const playersRef = useRef<(Tone.Player | null)[]>(Array(PAD_COUNT).fill(null));
  const sequenceRef = useRef<Tone.Sequence | null>(null);
  const recorderRef = useRef<Tone.Recorder | null>(null);

  const generateSample = async (padIndex: number) => {
    if (!sampleQuery.trim()) return;
    setIsGenerating(true);
    try {
      const res = await fetch("/api/generate-sample", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: sampleQuery, settings, roomCode }),
      });
      const { url } = await res.json();

      const newSamples = [...samples];
      newSamples[padIndex] = url;
      setSamples(newSamples);

      if (playersRef.current[padIndex]) {
        playersRef.current[padIndex]!.dispose();
      }
      playersRef.current[padIndex] = new Tone.Player(url).toDestination();
      await Tone.loaded();
    } catch (err) {
      console.error("Sample generation failed:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleStep = (padIndex: number, stepIndex: number) => {
    const newGrid = grid.map((row) => [...row]);
    newGrid[padIndex][stepIndex] = !newGrid[padIndex][stepIndex];
    setGrid(newGrid);
  };

  const triggerPad = (padIndex: number) => {
    const player = playersRef.current[padIndex];
    if (player && player.loaded) {
      player.start();
    }
  };

  const playSequence = useCallback(() => {
    if (sequenceRef.current) {
      sequenceRef.current.dispose();
    }

    const stepsPerBar = 16;
    const totalSteps = (settings.barCount / 4) * stepsPerBar * 4;

    sequenceRef.current = new Tone.Sequence(
      (time, step) => {
        for (let pad = 0; pad < PAD_COUNT; pad++) {
          const gridStep = step % STEPS;
          if (grid[pad][gridStep] && playersRef.current[pad]?.loaded) {
            playersRef.current[pad]!.start(time);
          }
        }
      },
      Array.from({ length: totalSteps }, (_, i) => i),
      "16n"
    );

    sequenceRef.current.start(0);
  }, [grid, settings.barCount]);

  const startRecording = async () => {
    const recorder = new Tone.Recorder();
    recorderRef.current = recorder;

    playersRef.current.forEach((player) => {
      if (player) player.connect(recorder);
    });

    recorder.start();
    playSequence();
    Tone.getTransport().start();
    setIsRecording(true);

    const loopDuration = (settings.barCount * 4 * 60) / settings.bpm;
    setTimeout(async () => {
      Tone.getTransport().stop();
      const recording = await recorder.stop();
      const blob = new Blob([recording], { type: "audio/webm" });

      const formData = new FormData();
      formData.append("file", blob, "sampler-recording.webm");
      formData.append("roomCode", roomCode);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const { url } = await res.json();
      setRecordedUrl(url);
      setIsRecording(false);
    }, loopDuration * 1000 + 200);
  };

  useEffect(() => {
    return () => {
      sequenceRef.current?.dispose();
      recorderRef.current?.dispose();
      playersRef.current.forEach((p) => p?.dispose());
    };
  }, []);

  return (
    <div className="space-y-6">
      <p className="text-gray-400 text-sm">
        Generate samples, load them onto pads, and build a pattern.
      </p>

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Describe a sample... (e.g., 'deep 808 kick')"
          value={sampleQuery}
          onChange={(e) => setSampleQuery(e.target.value)}
          className="flex-1 px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg
                     text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
        />
        <button
          onClick={() => generateSample(activePad)}
          disabled={isGenerating}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700
                     rounded-lg text-sm font-medium transition"
        >
          {isGenerating ? "Loading..." : `Load Pad ${activePad + 1}`}
        </button>
      </div>

      <div className="flex gap-3">
        {Array.from({ length: PAD_COUNT }).map((_, i) => (
          <button
            key={i}
            onClick={() => {
              setActivePad(i);
              triggerPad(i);
            }}
            className={`w-20 h-20 rounded-xl font-bold text-lg transition
              ${activePad === i ? "ring-2 ring-purple-400" : ""}
              ${samples[i] ? "bg-purple-700 hover:bg-purple-600" : "bg-gray-800 text-gray-600"}`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        {Array.from({ length: PAD_COUNT }).map((_, padIndex) => (
          <div key={padIndex} className="flex gap-1 items-center">
            <span className="w-8 text-xs text-gray-500 text-right">{padIndex + 1}</span>
            {Array.from({ length: STEPS }).map((_, stepIndex) => (
              <button
                key={stepIndex}
                onClick={() => toggleStep(padIndex, stepIndex)}
                disabled={!samples[padIndex]}
                className={`w-8 h-8 rounded transition text-xs
                  ${stepIndex % 4 === 0 ? "ml-1" : ""}
                  ${grid[padIndex][stepIndex]
                    ? "bg-purple-500"
                    : samples[padIndex]
                      ? "bg-gray-800 hover:bg-gray-700"
                      : "bg-gray-900 text-gray-700"
                  }`}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="flex gap-3 items-center">
        <select
          value={stemType}
          onChange={(e) => setStemType(e.target.value as StemType)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
        >
          {STEM_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button
          onClick={startRecording}
          disabled={isRecording || samples.every((s) => !s)}
          className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-700
                     rounded-lg text-sm font-medium transition"
        >
          {isRecording ? "Recording..." : "Record Loop"}
        </button>
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
            onClick={() => onPush(recordedUrl, `Sampler pattern`, stemType)}
            className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-medium"
          >
            Push to Master
          </button>
        </div>
      )}
    </div>
  );
}
