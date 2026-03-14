"use client";
import { useState } from "react";
import { RoomSettings, Track, StemType } from "@/lib/types";
import * as Tone from "tone";
import SamplerPads from "./SamplerPads";
import VocalRecorder from "./VocalRecorder";
import TextToVocal from "./TextToVocal";

interface Props {
  settings: RoomSettings;
  userId: string | null;
  roomCode: string;
  localDestination: Tone.ToneAudioNode;
  onPush: (track: Omit<Track, "removeVotes" | "pushedAt">) => void;
}

const TOOLS = [
  { id: "drums" as const, label: "909 Drums" },
  { id: "vocals" as const, label: "Record Vocals" },
  { id: "text" as const, label: "Text to Vocal" },
];

export default function CreationPanel({
  settings,
  userId,
  roomCode,
  localDestination,
  onPush,
}: Props) {
  const [activeTool, setActiveTool] = useState<"drums" | "vocals" | "text">("drums");

  const handlePush = (audioUrl: string, name: string, stemType: StemType) => {
    if (!userId) return;
    onPush({
      id: crypto.randomUUID(),
      userId,
      userName: "",
      name,
      audioUrl,
      stemType,
      creationLevel: 3,
      volume: 1,
      muted: false,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            onClick={() => setActiveTool(tool.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
              activeTool === tool.id
                ? "bg-purple-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {tool.label}
          </button>
        ))}
      </div>

      {activeTool === "drums" && (
        <SamplerPads
          settings={settings}
          roomCode={roomCode}
          localDestination={localDestination}
          onPush={handlePush}
        />
      )}
      {activeTool === "vocals" && (
        <VocalRecorder
          settings={settings}
          roomCode={roomCode}
          onPush={handlePush}
        />
      )}
      {activeTool === "text" && (
        <TextToVocal
          settings={settings}
          roomCode={roomCode}
          onPush={handlePush}
        />
      )}
    </div>
  );
}
