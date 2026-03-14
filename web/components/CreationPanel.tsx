"use client";
import { useState } from "react";
import { RoomSettings, Track, StemType } from "@/lib/types";
import LoopBrowser from "./LoopBrowser";
import TextToLoop from "./TextToLoop";
import SamplerPads from "./SamplerPads";
import SynthPlayer from "./SynthPlayer";

interface Props {
  settings: RoomSettings;
  userId: string | null;
  roomCode: string;
  onPreview: (audioUrl: string) => Promise<void>;
  onClearPreview: () => void;
  onPush: (track: Omit<Track, "removeVotes" | "pushedAt">) => void;
}

const levels = [
  { id: 1, label: "Loop Library", description: "Browse pre-made loops" },
  { id: 2, label: "Text → Loop", description: "AI-generated loops" },
  { id: 3, label: "Sampler", description: "Play AI samples on pads" },
  { id: 4, label: "Synth", description: "Play synths live" },
] as const;

export default function CreationPanel({
  settings,
  userId,
  roomCode,
  onPreview,
  onClearPreview,
  onPush,
}: Props) {
  const [activeLevel, setActiveLevel] = useState(1);

  const handlePush = (audioUrl: string, name: string, stemType: StemType) => {
    if (!userId) return;
    onPush({
      id: crypto.randomUUID(),
      userId,
      userName: "",
      name,
      audioUrl,
      stemType,
      creationLevel: activeLevel as 1 | 2 | 3 | 4,
      volume: 1,
      muted: false,
    });
    onClearPreview();
  };

  return (
    <div>
      <div className="flex gap-2 mb-6">
        {levels.map((level) => (
          <button
            key={level.id}
            onClick={() => setActiveLevel(level.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition
              ${activeLevel === level.id
                ? "bg-purple-600 text-white"
                : "bg-gray-900 text-gray-400 hover:text-white"}`}
          >
            <span className="block">{level.label}</span>
            <span className="block text-xs opacity-60">{level.description}</span>
          </button>
        ))}
      </div>

      {activeLevel === 1 && (
        <LoopBrowser
          settings={settings}
          onPreview={onPreview}
          onPush={handlePush}
        />
      )}
      {activeLevel === 2 && (
        <TextToLoop
          settings={settings}
          roomCode={roomCode}
          onPreview={onPreview}
          onPush={handlePush}
        />
      )}
      {activeLevel === 3 && (
        <SamplerPads
          settings={settings}
          roomCode={roomCode}
          onPreview={onPreview}
          onPush={handlePush}
        />
      )}
      {activeLevel === 4 && (
        <SynthPlayer
          settings={settings}
          roomCode={roomCode}
          onPreview={onPreview}
          onPush={handlePush}
        />
      )}
    </div>
  );
}
