"use client";
import * as Tone from "tone";
import { RoomSettings, StemType, InstrumentMode, Track } from "@/lib/types";
import StepSequenceMode from "./modes/StepSequenceMode";
import GenerateMode from "./modes/GenerateMode";
import LiveMode from "./modes/LiveMode";

interface Props {
  settings: RoomSettings;
  stemType: StemType;
  mode: InstrumentMode;
  userId: string | null;
  roomCode: string;
  localDestination: Tone.ToneAudioNode;
  onPush: (track: Omit<Track, "downVotes" | "upVotes" | "active" | "pushedAt">) => void;
  previewLocal: (audioUrl: string) => Promise<void>;
  clearLocal: () => void;
}

export default function InstrumentWorkspace({ settings, stemType, mode, userId, roomCode, localDestination, onPush, previewLocal, clearLocal }: Props) {
  const handlePush = (audioUrl: string, name: string, st: StemType, creationLevel: 1 | 2 | 3 | 4) => {
    if (!userId) return;
    onPush({
      id: crypto.randomUUID(),
      userId,
      userName: "",
      name,
      audioUrl,
      stemType: st,
      creationLevel,
      volume: 1,
      muted: false,
      removeVotes: [],
    });
  };

  if (mode === "sequence") {
    return (
      <StepSequenceMode
        settings={settings}
        stemType={stemType}
        roomCode={roomCode}
        localDestination={localDestination}
        onPush={handlePush}
      />
    );
  }

  if (mode === "generate") {
    return (
      <GenerateMode
        settings={settings}
        stemType={stemType}
        roomCode={roomCode}
        localDestination={localDestination}
        onPush={handlePush}
        previewLocal={previewLocal}
        clearLocal={clearLocal}
      />
    );
  }

  if (mode === "live") {
    return (
      <LiveMode
        settings={settings}
        stemType={stemType}
        roomCode={roomCode}
        localDestination={localDestination}
        onPush={handlePush}
      />
    );
  }

  return null;
}
