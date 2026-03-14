"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import * as Tone from "tone";
import { RoomSettings, StemType } from "@/lib/types";

interface Props {
  settings: RoomSettings;
  roomCode: string;
  onPreview: (audioUrl: string) => Promise<void>;
  onPush: (audioUrl: string, name: string, stemType: StemType) => void;
}

// 909-style kit using Tone.js synths
const KIT = [
  { name: "Kick", color: "#EF4444" },
  { name: "Snare", color: "#F97316" },
  { name: "Closed HH", color: "#EAB308" },
  { name: "Open HH", color: "#22C55E" },
  { name: "Clap", color: "#3B82F6" },
  { name: "Rim", color: "#A855F7" },
  { name: "Tom Lo", color: "#EC4899" },
  { name: "Tom Hi", color: "#14B8A6" },
] as const;

const STEPS = 16;
const PAD_COUNT = KIT.length;

function createDrumSynth(index: number, destination: Tone.ToneAudioNode): Tone.ToneAudioNode {
  switch (index) {
    case 0: // Kick
      return new Tone.MembraneSynth({
        pitchDecay: 0.05,
        octaves: 6,
        oscillator: { type: "sine" },
        envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 0.4 },
      }).connect(destination);
    case 1: // Snare
      return new Tone.NoiseSynth({
        noise: { type: "white" },
        envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.2 },
      }).connect(destination);
    case 2: // Closed HH
      return new Tone.MetalSynth({
        envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
        harmonicity: 5.1,
        modulationIndex: 32,
        resonance: 4000,
        octaves: 1.5,
      }).connect(destination);
    case 3: // Open HH
      return new Tone.MetalSynth({
        envelope: { attack: 0.001, decay: 0.3, release: 0.1 },
        harmonicity: 5.1,
        modulationIndex: 32,
        resonance: 4000,
        octaves: 1.5,
      }).connect(destination);
    case 4: // Clap
      return new Tone.NoiseSynth({
        noise: { type: "pink" },
        envelope: { attack: 0.005, decay: 0.15, sustain: 0, release: 0.1 },
      }).connect(destination);
    case 5: // Rim
      return new Tone.MembraneSynth({
        pitchDecay: 0.008,
        octaves: 2,
        envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.05 },
      }).connect(destination);
    case 6: // Tom Lo
      return new Tone.MembraneSynth({
        pitchDecay: 0.05,
        octaves: 4,
        oscillator: { type: "sine" },
        envelope: { attack: 0.001, decay: 0.3, sustain: 0.01, release: 0.3 },
      }).connect(destination);
    case 7: // Tom Hi
      return new Tone.MembraneSynth({
        pitchDecay: 0.05,
        octaves: 3,
        oscillator: { type: "sine" },
        envelope: { attack: 0.001, decay: 0.2, sustain: 0.01, release: 0.2 },
      }).connect(destination);
    default:
      return new Tone.MembraneSynth().connect(destination);
  }
}

function triggerSynth(synth: Tone.ToneAudioNode, index: number, time?: number) {
  const t = time ?? Tone.now();
  if (synth instanceof Tone.MembraneSynth) {
    const notes: Record<number, string> = { 0: "C1", 5: "G3", 6: "G1", 7: "D2" };
    synth.triggerAttackRelease(notes[index] || "C2", "8n", t);
  } else if (synth instanceof Tone.NoiseSynth) {
    synth.triggerAttackRelease("16n", t);
  } else if (synth instanceof Tone.MetalSynth) {
    synth.triggerAttackRelease("32n", t);
  }
}

export default function SamplerPads({ settings, roomCode, onPreview, onPush }: Props) {
  const [grid, setGrid] = useState<boolean[][]>(
    Array(PAD_COUNT).fill(null).map(() => Array(STEPS).fill(false))
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(-1);
  const synthsRef = useRef<Tone.ToneAudioNode[]>([]);
  const sequenceRef = useRef<Tone.Sequence | null>(null);

  // Create synths on mount
  useEffect(() => {
    const synths = KIT.map((_, i) => createDrumSynth(i, Tone.getDestination()));
    synthsRef.current = synths;
    return () => {
      synths.forEach((s) => s.dispose());
      sequenceRef.current?.dispose();
    };
  }, []);

  const toggleStep = (padIndex: number, stepIndex: number) => {
    setGrid((prev) => {
      const next = prev.map((row) => [...row]);
      next[padIndex][stepIndex] = !next[padIndex][stepIndex];
      return next;
    });
  };

  const tapPad = async (padIndex: number) => {
    await Tone.start();
    triggerSynth(synthsRef.current[padIndex], padIndex);
  };

  // Keep grid ref current for the sequence callback
  const gridRef = useRef(grid);
  gridRef.current = grid;

  const togglePlayback = useCallback(async () => {
    await Tone.start();

    if (isPlaying) {
      Tone.getTransport().stop();
      sequenceRef.current?.dispose();
      sequenceRef.current = null;
      setIsPlaying(false);
      setCurrentStep(-1);
      return;
    }

    Tone.getTransport().bpm.value = settings.bpm;

    sequenceRef.current = new Tone.Sequence(
      (time, step) => {
        const g = gridRef.current;
        for (let pad = 0; pad < PAD_COUNT; pad++) {
          if (g[pad][step % STEPS]) {
            triggerSynth(synthsRef.current[pad], pad, time);
          }
        }
        Tone.getDraw().schedule(() => setCurrentStep(step % STEPS), time);
      },
      Array.from({ length: STEPS }, (_, i) => i),
      "16n"
    );

    sequenceRef.current.loop = true;
    sequenceRef.current.start(0);
    Tone.getTransport().start();
    setIsPlaying(true);
  }, [isPlaying, settings.bpm]);

  const renderAndUpload = useCallback(async () => {
    setIsRendering(true);
    try {
      const loopDuration = (settings.barCount * 4 * 60) / settings.bpm;

      // Render offline
      const buffer = await Tone.Offline(({ transport }) => {
        transport.bpm.value = settings.bpm;
        const offlineSynths = KIT.map((_, i) => createDrumSynth(i, Tone.getDestination()));

        const seq = new Tone.Sequence(
          (time, step) => {
            for (let pad = 0; pad < PAD_COUNT; pad++) {
              if (grid[pad][step % STEPS]) {
                triggerSynth(offlineSynths[pad], pad, time);
              }
            }
          },
          Array.from({ length: STEPS }, (_, i) => i),
          "16n"
        );
        seq.loop = true;
        seq.start(0);
        transport.start();
      }, loopDuration);

      // Convert to WAV blob
      const wavBlob = bufferToWav(buffer);

      // Upload to R2
      const formData = new FormData();
      formData.append("file", wavBlob, "groove.wav");
      formData.append("roomCode", roomCode);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const { url } = await res.json();
      setRenderedUrl(url);
      await onPreview(url);
    } catch (err) {
      console.error("Render failed:", err);
    } finally {
      setIsRendering(false);
    }
  }, [grid, settings, roomCode, onPreview]);

  return (
    <div className="space-y-5">
      <p className="text-gray-400 text-sm">
        909 drum machine — tap pads to preview, click the grid to build your pattern.
      </p>

      {/* Pads */}
      <div className="grid grid-cols-4 gap-2">
        {KIT.map((drum, i) => (
          <button
            key={i}
            onClick={() => tapPad(i)}
            className="h-16 rounded-lg font-medium text-sm transition hover:brightness-110 active:scale-95"
            style={{ backgroundColor: drum.color + "33", borderLeft: `3px solid ${drum.color}` }}
          >
            {drum.name}
          </button>
        ))}
      </div>

      {/* Step sequencer grid */}
      <div className="space-y-1 overflow-x-auto">
        {/* Beat markers */}
        <div className="flex gap-1 items-center">
          <span className="w-20 shrink-0" />
          {Array.from({ length: STEPS }).map((_, stepIndex) => (
            <div
              key={stepIndex}
              className={`w-8 h-4 shrink-0 flex items-center justify-center text-[10px]
                ${stepIndex % 4 === 0 ? "ml-1 text-gray-400 font-bold" : "text-gray-600"}`}
            >
              {stepIndex % 4 === 0 ? stepIndex / 4 + 1 : "·"}
            </div>
          ))}
        </div>

        {/* Grid rows */}
        {KIT.map((drum, padIndex) => (
          <div key={padIndex} className="flex gap-1 items-center">
            <span
              className="w-20 shrink-0 text-xs truncate pr-2 text-right"
              style={{ color: drum.color }}
            >
              {drum.name}
            </span>
            {Array.from({ length: STEPS }).map((_, stepIndex) => (
              <button
                key={stepIndex}
                onClick={() => toggleStep(padIndex, stepIndex)}
                className={`w-8 h-8 shrink-0 rounded transition-all
                  ${stepIndex % 4 === 0 ? "ml-1" : ""}
                  ${currentStep === stepIndex ? "ring-1 ring-white" : ""}
                  ${grid[padIndex][stepIndex]
                    ? "hover:brightness-110"
                    : "bg-gray-800 hover:bg-gray-700"
                  }`}
                style={grid[padIndex][stepIndex] ? { backgroundColor: drum.color } : {}}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex gap-3 items-center">
        <button
          onClick={togglePlayback}
          className={`px-5 py-2 rounded-lg font-semibold text-sm transition
            ${isPlaying ? "bg-red-600 hover:bg-red-500" : "bg-green-600 hover:bg-green-500"}`}
        >
          {isPlaying ? "Stop" : "Play"}
        </button>
        <button
          onClick={renderAndUpload}
          disabled={isRendering || grid.every((row) => row.every((s) => !s))}
          className="px-5 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700
                     disabled:text-gray-500 rounded-lg text-sm font-semibold transition"
        >
          {isRendering ? "Rendering..." : "Render & Preview"}
        </button>
        <span className="text-gray-500 text-xs font-mono">
          {settings.bpm} BPM · {settings.barCount} bars
        </span>
      </div>

      {/* Rendered result */}
      {renderedUrl && (
        <div className="bg-gray-900 rounded-lg p-4 flex gap-2">
          <button
            onClick={() => onPreview(renderedUrl)}
            className="flex-1 py-2 bg-yellow-600 hover:bg-yellow-500 rounded-lg text-sm font-medium"
          >
            Preview Again
          </button>
          <button
            onClick={renderAndUpload}
            className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium"
          >
            Re-render
          </button>
          <button
            onClick={() => onPush(renderedUrl, "909 Groove", "drums")}
            className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-medium"
          >
            Push to Master
          </button>
        </div>
      )}
    </div>
  );
}

// Convert Tone.js ToneAudioBuffer to WAV blob
function bufferToWav(buffer: Tone.ToneAudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const wavBuffer = new ArrayBuffer(44 + length * numChannels * 2);
  const view = new DataView(wavBuffer);

  // WAV header
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + length * numChannels * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true); // 16-bit
  writeString(36, "data");
  view.setUint32(40, length * numChannels * 2, true);

  // Interleave channels
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([wavBuffer], { type: "audio/wav" });
}
